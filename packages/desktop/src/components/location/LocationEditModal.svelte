<script lang="ts">
  /**
   * LocationEditModal - Popup modal for editing location address, GPS, and cultural region
   * Per DECISION-011: Edit button opens popup modal with map for GPS marker dragging
   * Per DECISION-012: Cultural region is predefined dropdown only (no custom entry)
   */
  import { onMount } from 'svelte';
  import type { Location, LocationInput } from '@au-archive/core';
  import Map from '../Map.svelte';
  // DECISION-012: Use census-regions for cultural region options
  import { getCulturalRegionsForState, getCulturalRegionFromCounty } from '../../lib/census-regions';

  interface Props {
    location: Location;
    onSave: (updates: Partial<LocationInput>, addressVerified: boolean, gpsVerified: boolean, culturalRegion: string | null) => Promise<void>;
    onClose: () => void;
  }

  let { location, onSave, onClose }: Props = $props();

  // Form state
  let formData = $state({
    // Address
    address_street: location.address?.street || '',
    address_city: location.address?.city || '',
    address_county: location.address?.county || '',
    address_state: location.address?.state || '',
    address_zipcode: location.address?.zipcode || '',
    // GPS
    gps_lat: location.gps?.lat?.toString() || '',
    gps_lng: location.gps?.lng?.toString() || '',
    // Verification
    address_verified: location.address?.verified || false,
    gps_verified: location.gps?.verifiedOnMap || false,
    // Cultural Region (DECISION-012: predefined options only, no custom entry)
    cultural_region: (location as any).culturalRegion || '',
  });

  let saving = $state(false);
  let error = $state<string | null>(null);
  let activeTab = $state<'address' | 'gps'>('address');

  // Cultural region options based on state (DECISION-012: auto-suggest from county)
  const culturalRegions = $derived(getCulturalRegionsForState(formData.address_state));
  const suggestedCulturalRegion = $derived(
    getCulturalRegionFromCounty(formData.address_state, formData.address_county)
  );

  // Handle GPS marker drag on map
  function handleGpsUpdate(locid: string, lat: number, lng: number) {
    formData.gps_lat = lat.toFixed(6);
    formData.gps_lng = lng.toFixed(6);
    formData.gps_verified = true;
  }

  // Create a temporary location for map display
  const mapLocation = $derived({
    ...location,
    gps: formData.gps_lat && formData.gps_lng
      ? {
          lat: parseFloat(formData.gps_lat),
          lng: parseFloat(formData.gps_lng),
          source: 'user_map_click' as const,
          verifiedOnMap: formData.gps_verified,
        }
      : undefined,
  });

  async function handleSubmit() {
    try {
      saving = true;
      error = null;

      const updates: Partial<LocationInput> = {};

      // Address updates
      if (formData.address_street || formData.address_city || formData.address_state) {
        updates.address = {
          street: formData.address_street || undefined,
          city: formData.address_city || undefined,
          county: formData.address_county || undefined,
          state: formData.address_state || undefined,
          zipcode: formData.address_zipcode || undefined,
          verified: formData.address_verified,
        };
      }

      // GPS updates
      if (formData.gps_lat && formData.gps_lng) {
        updates.gps = {
          lat: parseFloat(formData.gps_lat),
          lng: parseFloat(formData.gps_lng),
          source: 'user_map_click',
          verifiedOnMap: formData.gps_verified,
        };
      }

      // Cultural region (DECISION-012: predefined options only)
      const culturalRegion = formData.cultural_region || null;

      await onSave(updates, formData.address_verified, formData.gps_verified, culturalRegion);
      onClose();
    } catch (err) {
      console.error('Error saving location:', err);
      error = 'Failed to save changes';
    } finally {
      saving = false;
    }
  }

  // Close modal on Escape key
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Modal backdrop (DECISION-013: z-[99999] ensures modal appears above all map layers) -->
<div
  class="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50"
  onclick={onClose}
  role="button"
  tabindex="-1"
>
  <!-- Modal content -->
  <div
    class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden relative z-[100000]"
    onclick={(e) => e.stopPropagation()}
    role="dialog"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
      <h2 class="text-lg font-semibold text-foreground">Edit Location</h2>
      <button
        onclick={onClose}
        class="p-1 text-gray-400 hover:text-gray-600 transition"
        aria-label="Close"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-gray-200">
      <button
        onclick={() => activeTab = 'address'}
        class="flex-1 px-4 py-3 text-sm font-medium transition
          {activeTab === 'address'
            ? 'text-accent border-b-2 border-accent bg-accent/5'
            : 'text-gray-500 hover:text-gray-700'}"
      >
        Mailing Address
      </button>
      <button
        onclick={() => activeTab = 'gps'}
        class="flex-1 px-4 py-3 text-sm font-medium transition
          {activeTab === 'gps'
            ? 'text-accent border-b-2 border-accent bg-accent/5'
            : 'text-gray-500 hover:text-gray-700'}"
      >
        GPS & Map
      </button>
    </div>

    <!-- Content -->
    <div class="p-6 overflow-y-auto max-h-[60vh]">
      {#if error}
        <div class="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm">
          {error}
        </div>
      {/if}

      {#if activeTab === 'address'}
        <!-- Address Tab -->
        <div class="space-y-4">
          <div>
            <label for="street" class="block text-sm font-medium text-gray-700 mb-1">Street</label>
            <input
              id="street"
              type="text"
              bind:value={formData.address_street}
              class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="city" class="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                id="city"
                type="text"
                bind:value={formData.address_city}
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label for="county" class="block text-sm font-medium text-gray-700 mb-1">County</label>
              <input
                id="county"
                type="text"
                bind:value={formData.address_county}
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="state" class="block text-sm font-medium text-gray-700 mb-1">State</label>
              <input
                id="state"
                type="text"
                bind:value={formData.address_state}
                maxlength="2"
                placeholder="NY"
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent uppercase"
              />
            </div>
            <div>
              <label for="zipcode" class="block text-sm font-medium text-gray-700 mb-1">Zipcode</label>
              <input
                id="zipcode"
                type="text"
                bind:value={formData.address_zipcode}
                placeholder="12345"
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>

          <!-- Address Verification -->
          <div class="pt-4 border-t border-gray-200">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={formData.address_verified}
                class="w-4 h-4 text-verified rounded border-gray-300 focus:ring-verified"
              />
              <span class="text-sm font-medium text-gray-700">
                Verify this address is correct
              </span>
            </label>
            <p class="text-xs text-gray-500 mt-1 ml-6">
              Check this box after confirming the address matches the actual location
            </p>
          </div>

          <!-- Cultural Region (DECISION-012: predefined options only, no custom entry) -->
          <div class="pt-4 border-t border-gray-200">
            <label for="cultural_region" class="block text-sm font-medium text-gray-700 mb-1">
              Cultural Region
              <span class="font-normal text-gray-400">(optional)</span>
            </label>
            <select
              id="cultural_region"
              bind:value={formData.cultural_region}
              class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">Not specified</option>
              {#each culturalRegions as region}
                <option value={region}>{region}</option>
              {/each}
            </select>
            {#if suggestedCulturalRegion && !formData.cultural_region}
              <p class="text-xs text-accent mt-1">
                Suggestion based on county: <button
                  type="button"
                  onclick={() => formData.cultural_region = suggestedCulturalRegion}
                  class="font-medium underline hover:no-underline"
                >{suggestedCulturalRegion}</button>
              </p>
            {:else}
              <p class="text-xs text-gray-500 mt-1">
                Cultural region is subjective and does not affect Location verification
              </p>
            {/if}
          </div>
        </div>
      {:else}
        <!-- GPS Tab -->
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="gps_lat" class="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
              <input
                id="gps_lat"
                type="text"
                bind:value={formData.gps_lat}
                placeholder="42.123456"
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent font-mono text-sm"
              />
            </div>
            <div>
              <label for="gps_lng" class="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
              <input
                id="gps_lng"
                type="text"
                bind:value={formData.gps_lng}
                placeholder="-73.123456"
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent font-mono text-sm"
              />
            </div>
          </div>

          <!-- Map for GPS verification -->
          <div>
            <p class="text-sm text-gray-600 mb-2">
              Drag the marker to the exact location, or click on the map to set GPS
            </p>
            <div class="h-64 rounded border border-gray-200 overflow-hidden">
              <Map
                locations={mapLocation.gps ? [mapLocation] : []}
                onLocationVerify={handleGpsUpdate}
                onMapClick={(lat, lng) => {
                  formData.gps_lat = lat.toFixed(6);
                  formData.gps_lng = lng.toFixed(6);
                }}
                zoom={mapLocation.gps ? 17 : 10}
              />
            </div>
          </div>

          <!-- GPS Verification -->
          <div class="pt-4 border-t border-gray-200">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={formData.gps_verified}
                class="w-4 h-4 text-verified rounded border-gray-300 focus:ring-verified"
              />
              <span class="text-sm font-medium text-gray-700">
                Verify this GPS location is accurate
              </span>
            </label>
            <p class="text-xs text-gray-500 mt-1 ml-6">
              Check this box after confirming the marker is at the correct spot on the map
            </p>
          </div>
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
      <button
        type="button"
        onclick={onClose}
        class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition"
      >
        Cancel
      </button>
      <button
        type="button"
        onclick={handleSubmit}
        disabled={saving}
        class="px-4 py-2 text-sm font-medium text-white bg-accent rounded hover:opacity-90 transition disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  </div>
</div>
