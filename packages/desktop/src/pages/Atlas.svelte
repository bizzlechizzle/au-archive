<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from '../stores/router';
  import Map from '../components/Map.svelte';
  import type { Location } from '@au-archive/core';

  let locations = $state<Location[]>([]);
  let loading = $state(true);
  let showFilters = $state(false);
  let filterState = $state('');
  let filterType = $state('');

  // Quick create modal state
  let showCreateModal = $state(false);
  let createLat = $state(0);
  let createLng = $state(0);
  let createName = $state('');
  let createType = $state('');
  let createState = $state('');
  let createCity = $state('');
  let createCounty = $state('');
  let createStreet = $state('');
  let createZipcode = $state('');
  let creating = $state(false);
  let geocoding = $state(false);
  let geocodeError = $state('');

  // Show locations that are mappable: has GPS OR has address (city+state, zipcode)
  function isMappable(loc: Location): boolean {
    // Has GPS coordinates
    if (loc.gps?.lat && loc.gps?.lng) return true;
    // Has city + state (can be geocoded)
    if (loc.address?.city && loc.address?.state) return true;
    // Has zipcode (can be geocoded)
    if (loc.address?.zipcode) return true;
    return false;
  }

  let filteredLocations = $derived(() => {
    return locations.filter((loc) => {
      const matchesState = !filterState || loc.address?.state === filterState;
      const matchesType = !filterType || loc.type === filterType;
      // Show all mappable locations, not just those with GPS
      return matchesState && matchesType && isMappable(loc);
    });
  });

  let uniqueStates = $derived(() => {
    const states = new Set(locations.filter(isMappable).map(l => l.address?.state).filter(Boolean));
    return Array.from(states).sort();
  });

  let uniqueTypes = $derived(() => {
    const types = new Set(locations.filter(isMappable).map(l => l.type).filter(Boolean));
    return Array.from(types).sort();
  });

  async function loadLocations() {
    try {
      loading = true;
      if (!window.electronAPI?.locations) {
        console.error('Electron API not available - preload script may have failed to load');
        return;
      }
      // Load ALL locations - filtering for mappable ones happens in filteredLocations
      const allLocations = await window.electronAPI.locations.findAll();
      locations = allLocations;
    } catch (error) {
      console.error('Error loading locations:', error);
    } finally {
      loading = false;
    }
  }

  function handleLocationClick(location: Location) {
    router.navigate(`/location/${location.locid}`);
  }

  function handleMapClick(lat: number, lng: number) {
    // Left-click just logs for now
  }

  async function handleMapRightClick(lat: number, lng: number) {
    // Right-click opens quick create modal
    createLat = lat;
    createLng = lng;
    createName = '';
    createType = '';
    createState = '';
    createCity = '';
    createCounty = '';
    createStreet = '';
    createZipcode = '';
    geocodeError = '';
    showCreateModal = true;

    // Auto-geocode to get address
    if (window.electronAPI?.geocode) {
      try {
        geocoding = true;
        const result = await window.electronAPI.geocode.reverse(lat, lng);

        if (result?.address) {
          createCity = result.address.city || '';
          createState = result.address.stateCode || result.address.state || '';
          createCounty = result.address.county || '';
          createStreet = result.address.street || '';
          createZipcode = result.address.zipcode || '';
        }
      } catch (error) {
        console.error('Geocoding failed:', error);
        geocodeError = 'Could not look up address. Enter manually.';
      } finally {
        geocoding = false;
      }
    }
  }

  function closeCreateModal() {
    showCreateModal = false;
    createName = '';
    createType = '';
    createState = '';
    createCity = '';
    createCounty = '';
    createStreet = '';
    createZipcode = '';
    geocodeError = '';
  }

  async function quickCreateLocation() {
    if (!createName.trim()) return;
    if (!window.electronAPI?.locations) return;

    try {
      creating = true;
      const currentUser = await window.electronAPI.settings?.get('current_user') || 'default';

      const newLocation = await window.electronAPI.locations.create({
        locnam: createName.trim(),
        type: createType || undefined,
        gps: {
          lat: createLat,
          lng: createLng,
          source: 'user_map_click',
          verifiedOnMap: true, // User clicked on map, so GPS is verified
        },
        address: {
          street: createStreet || undefined,
          city: createCity || undefined,
          county: createCounty || undefined,
          state: createState || undefined,
          zipcode: createZipcode || undefined,
          confidence: geocoding ? undefined : 'high', // High confidence if geocoded
        },
        auth_imp: currentUser,
      });

      // Close modal and refresh
      closeCreateModal();
      await loadLocations();

      // Navigate to the new location
      if (newLocation?.locid) {
        router.navigate(`/location/${newLocation.locid}`);
      }
    } catch (error) {
      console.error('Error creating location:', error);
    } finally {
      creating = false;
    }
  }

  onMount(() => {
    loadLocations();
  });
</script>

<div class="h-full flex flex-col">
  <div class="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
    <div>
      <h1 class="text-xl font-semibold text-foreground">Atlas</h1>
      <p class="text-xs text-gray-500">
        {#if !loading}
          Showing {filteredLocations().length} of {locations.length} mappable locations
        {/if}
      </p>
    </div>
    <button
      onclick={() => showFilters = !showFilters}
      class="px-4 py-2 bg-gray-100 text-foreground rounded hover:bg-gray-200 transition text-sm"
    >
      {showFilters ? 'Hide' : 'Show'} Filters
    </button>
  </div>

  {#if showFilters}
    <div class="bg-gray-50 border-b border-gray-200 px-6 py-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label for="atlas-state" class="block text-xs font-medium text-gray-700 mb-1">State</label>
          <select
            id="atlas-state"
            bind:value={filterState}
            class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">All States</option>
            {#each uniqueStates() as state}
              <option value={state}>{state}</option>
            {/each}
          </select>
        </div>

        <div>
          <label for="atlas-type" class="block text-xs font-medium text-gray-700 mb-1">Type</label>
          <select
            id="atlas-type"
            bind:value={filterType}
            class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">All Types</option>
            {#each uniqueTypes() as type}
              <option value={type}>{type}</option>
            {/each}
          </select>
        </div>
      </div>
    </div>
  {/if}

  <div class="flex-1 relative">
    <!-- ALWAYS show the map - it's an atlas, not a placeholder -->
    <Map
      locations={filteredLocations()}
      onLocationClick={handleLocationClick}
      onMapClick={handleMapClick}
      onMapRightClick={handleMapRightClick}
    />
    {#if loading}
      <div class="absolute top-2 left-1/2 -translate-x-1/2 bg-white px-4 py-2 rounded shadow-lg z-10">
        <p class="text-gray-500 text-sm">Loading locations...</p>
      </div>
    {/if}
  </div>
</div>

<!-- Quick Create Modal -->
{#if showCreateModal}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
      <div class="px-6 py-4 border-b border-gray-200">
        <h2 class="text-lg font-semibold text-foreground">Quick Create Location</h2>
        <div class="flex items-center gap-2 text-sm text-gray-500">
          <span>GPS: {createLat.toFixed(6)}, {createLng.toFixed(6)}</span>
          {#if geocoding}
            <span class="inline-flex items-center gap-1 text-accent">
              <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Looking up address...
            </span>
          {:else if createCity || createState}
            <span class="text-green-600">Address found</span>
          {/if}
        </div>
        {#if geocodeError}
          <p class="text-sm text-yellow-600 mt-1">{geocodeError}</p>
        {/if}
      </div>

      <div class="px-6 py-4 space-y-4 max-h-96 overflow-y-auto">
        <div>
          <label for="create-name" class="block text-sm font-medium text-gray-700 mb-1">
            Location Name *
          </label>
          <input
            id="create-name"
            type="text"
            bind:value={createName}
            placeholder="Enter location name"
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div>
          <label for="create-type" class="block text-sm font-medium text-gray-700 mb-1">
            Type
          </label>
          <select
            id="create-type"
            bind:value={createType}
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">Select type...</option>
            {#each uniqueTypes() as type}
              <option value={type}>{type}</option>
            {/each}
            <option value="other">Other</option>
          </select>
        </div>

        <div class="border-t border-gray-200 pt-4">
          <p class="text-sm font-medium text-gray-700 mb-3">Address {geocoding ? '(loading...)' : '(auto-filled from GPS)'}</p>

          <div>
            <label for="create-street" class="block text-xs text-gray-500 mb-1">Street</label>
            <input
              id="create-street"
              type="text"
              bind:value={createStreet}
              placeholder="123 Main St"
              class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent text-sm"
            />
          </div>

          <div class="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label for="create-city" class="block text-xs text-gray-500 mb-1">City</label>
              <input
                id="create-city"
                type="text"
                bind:value={createCity}
                placeholder="City"
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent text-sm"
              />
            </div>
            <div>
              <label for="create-county" class="block text-xs text-gray-500 mb-1">County</label>
              <input
                id="create-county"
                type="text"
                bind:value={createCounty}
                placeholder="County"
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent text-sm"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label for="create-state" class="block text-xs text-gray-500 mb-1">State</label>
              <input
                id="create-state"
                type="text"
                bind:value={createState}
                placeholder="NY"
                maxlength="2"
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent text-sm uppercase"
              />
            </div>
            <div>
              <label for="create-zipcode" class="block text-xs text-gray-500 mb-1">ZIP Code</label>
              <input
                id="create-zipcode"
                type="text"
                bind:value={createZipcode}
                placeholder="12345"
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
        <button
          onclick={closeCreateModal}
          class="px-4 py-2 text-gray-700 hover:text-gray-900 transition"
        >
          Cancel
        </button>
        <button
          onclick={quickCreateLocation}
          disabled={creating || !createName.trim() || geocoding}
          class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Create Location'}
        </button>
      </div>
    </div>
  </div>
{/if}
