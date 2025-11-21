<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from '../stores/router';
  import Map from '../components/Map.svelte';
  import LocationEditForm from '../components/LocationEditForm.svelte';
  import type { Location, LocationInput } from '@au-archive/core';

  interface Props {
    locationId: string;
  }

  let { locationId }: Props = $props();

  let location = $state<Location | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let isEditing = $state(false);

  async function loadLocation() {
    try {
      loading = true;
      error = null;
      location = await window.electronAPI.locations.findById(locationId);
      if (!location) {
        error = 'Location not found';
      }
    } catch (err) {
      console.error('Error loading location:', err);
      error = 'Failed to load location';
    } finally {
      loading = false;
    }
  }

  async function handleSave(updates: Partial<LocationInput>) {
    if (!location) return;

    await window.electronAPI.locations.update(location.locid, updates);
    await loadLocation();
    isEditing = false;
  }

  function handleCancelEdit() {
    isEditing = false;
  }

  onMount(() => {
    loadLocation();
  });
</script>

<div class="h-full overflow-auto">
  {#if loading}
    <div class="flex items-center justify-center h-full">
      <p class="text-gray-500">Loading location...</p>
    </div>
  {:else if error || !location}
    <div class="flex items-center justify-center h-full">
      <div class="text-center">
        <p class="text-red-500 text-lg">{error || 'Location not found'}</p>
        <button
          onclick={() => router.navigate('/locations')}
          class="mt-4 px-4 py-2 bg-accent text-white rounded hover:opacity-90"
        >
          Back to Locations
        </button>
      </div>
    </div>
  {:else}
    <div class="max-w-6xl mx-auto p-8">
      <div class="mb-6 flex justify-between items-start">
        <div>
          <button
            onclick={() => router.navigate('/locations')}
            class="text-sm text-accent hover:underline mb-2"
          >
            &larr; Back to Locations
          </button>
          <h1 class="text-3xl font-bold text-foreground">{location.locnam}</h1>
          {#if location.akanam}
            <p class="text-gray-500">Also Known As: {location.akanam}</p>
          {/if}
        </div>
        <button
          onclick={() => isEditing = !isEditing}
          class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition"
        >
          {isEditing ? 'Cancel Edit' : 'Edit'}
        </button>
      </div>

      {#if isEditing}
        <LocationEditForm
          location={location}
          onSave={handleSave}
          onCancel={handleCancelEdit}
        />
      {:else}

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4 text-foreground">Information</h2>
          <dl class="space-y-3">
            {#if location.type}
              <div>
                <dt class="text-sm font-medium text-gray-500">Type</dt>
                <dd class="text-base text-gray-900">{location.type}</dd>
              </div>
            {/if}

            {#if location.stype}
              <div>
                <dt class="text-sm font-medium text-gray-500">Sub-Type</dt>
                <dd class="text-base text-gray-900">{location.stype}</dd>
              </div>
            {/if}

            {#if location.condition}
              <div>
                <dt class="text-sm font-medium text-gray-500">Condition</dt>
                <dd class="text-base text-gray-900">{location.condition}</dd>
              </div>
            {/if}

            {#if location.status}
              <div>
                <dt class="text-sm font-medium text-gray-500">Status</dt>
                <dd class="text-base text-gray-900">{location.status}</dd>
              </div>
            {/if}

            {#if location.documentation}
              <div>
                <dt class="text-sm font-medium text-gray-500">Documentation</dt>
                <dd class="text-base text-gray-900">{location.documentation}</dd>
              </div>
            {/if}

            {#if location.access}
              <div>
                <dt class="text-sm font-medium text-gray-500">Access</dt>
                <dd class="text-base text-gray-900">{location.access}</dd>
              </div>
            {/if}

            {#if location.historic}
              <div>
                <dt class="text-sm font-medium text-gray-500">Historic Landmark</dt>
                <dd class="text-base text-gray-900">Yes</dd>
              </div>
            {/if}
          </dl>
        </div>

        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4 text-foreground">Location</h2>

          {#if location.address}
            <div class="mb-4">
              <h3 class="text-sm font-medium text-gray-500 mb-2">Address</h3>
              <p class="text-base text-gray-900">
                {#if location.address.street}{location.address.street}<br/>{/if}
                {#if location.address.city}{location.address.city}, {/if}
                {#if location.address.state}{location.address.state} {/if}
                {#if location.address.zipcode}{location.address.zipcode}{/if}
              </p>
            </div>
          {/if}

          {#if location.gps}
            <div class="mb-4">
              <h3 class="text-sm font-medium text-gray-500 mb-2">GPS Coordinates</h3>
              <p class="text-base text-gray-900 font-mono text-sm">
                {location.gps.lat.toFixed(6)}, {location.gps.lng.toFixed(6)}
              </p>
              {#if location.gps.source}
                <p class="text-xs text-gray-500 mt-1">Source: {location.gps.source}</p>
              {/if}
              {#if location.gps.verifiedOnMap}
                <p class="text-xs text-green-600 mt-1">Verified on map</p>
              {/if}
            </div>

            <div class="h-64 rounded overflow-hidden">
              <Map locations={[location]} />
            </div>
          {:else}
            <p class="text-gray-500">No GPS coordinates available</p>
          {/if}
        </div>
      </div>

      <div class="mt-6 bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-semibold mb-4 text-foreground">Media</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h3 class="text-sm font-medium text-gray-500 mb-2">Images</h3>
            <div class="text-center text-gray-400 py-4 border-2 border-dashed border-gray-200 rounded">
              <p class="text-sm">No images</p>
            </div>
          </div>
          <div>
            <h3 class="text-sm font-medium text-gray-500 mb-2">Videos</h3>
            <div class="text-center text-gray-400 py-4 border-2 border-dashed border-gray-200 rounded">
              <p class="text-sm">No videos</p>
            </div>
          </div>
          <div>
            <h3 class="text-sm font-medium text-gray-500 mb-2">Documents</h3>
            <div class="text-center text-gray-400 py-4 border-2 border-dashed border-gray-200 rounded">
              <p class="text-sm">No documents</p>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-6 bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-semibold mb-4 text-foreground">Metadata</h2>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span class="text-gray-500">Location ID:</span>
            <span class="ml-2 font-mono text-xs">{location.loc12}</span>
          </div>
          {#if location.locadd}
            <div>
              <span class="text-gray-500">Added:</span>
              <span class="ml-2">{new Date(location.locadd).toLocaleDateString()}</span>
            </div>
          {/if}
          {#if location.locup}
            <div>
              <span class="text-gray-500">Updated:</span>
              <span class="ml-2">{new Date(location.locup).toLocaleDateString()}</span>
            </div>
          {/if}
          {#if location.auth_imp}
            <div>
              <span class="text-gray-500">Author:</span>
              <span class="ml-2">{location.auth_imp}</span>
            </div>
          {/if}
        </div>
      </div>
      {/if}
    </div>
  {/if}
</div>
