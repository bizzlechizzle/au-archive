<script lang="ts">
  /**
   * LocationNerdStats - Technical metadata (IDs, timestamps, GPS details, counts)
   * Per LILBITS: ~150 lines, single responsibility
   * Migration 34: Enhanced with per-user view tracking
   * Location Settings Overhaul: Added PIN-protected settings section
   */
  import type { Location } from '@au-archive/core';
  import { goto } from '$app/navigation';

  interface Props {
    location: Location;
    imageCount: number;
    videoCount: number;
    documentCount: number;
    onEdit?: () => void;
  }

  let { location, imageCount, videoCount, documentCount, onEdit }: Props = $props();

  let isOpen = $state(false);
  let copiedField = $state<string | null>(null);

  // Location Settings state
  let settingsOpen = $state(false);
  let settingsUnlocked = $state(false);
  let pinInput = $state('');
  let pinError = $state('');
  let fixingImages = $state(false);
  let fixingVideos = $state(false);
  let fixMessage = $state('');
  let showDeleteConfirm = $state(false);
  let deleting = $state(false);

  // Migration 34: Per-user view statistics
  interface ViewStats {
    totalViews: number;
    uniqueViewers: number;
    lastViewedAt: string | null;
    recentViewers: Array<{
      user_id: string;
      username: string;
      display_name: string | null;
      view_count: number;
      last_viewed_at: string;
    }>;
  }
  let viewStats = $state<ViewStats | null>(null);
  let loadingViewStats = $state(false);

  // Fetch view stats when section is opened
  $effect(() => {
    if (isOpen && !viewStats && !loadingViewStats) {
      loadingViewStats = true;
      window.electronAPI?.locations?.getViewStats(location.locid)
        .then((stats) => {
          viewStats = stats;
        })
        .catch((err) => {
          console.warn('[NerdStats] Failed to load view stats:', err);
        })
        .finally(() => {
          loadingViewStats = false;
        });
    }
  });

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text);
    copiedField = field;
    setTimeout(() => {
      copiedField = null;
    }, 1500);
  }

  // PIN verification
  async function verifyPin() {
    if (!pinInput) {
      pinError = 'Please enter your PIN';
      return;
    }

    try {
      // Get current user to verify PIN against
      const users = await window.electronAPI?.users?.findAll?.() || [];
      const currentUser = users[0];

      if (!currentUser) {
        pinError = 'No user found';
        return;
      }

      const result = await window.electronAPI?.users?.verifyPin(currentUser.user_id, pinInput);
      if (result?.success) {
        settingsUnlocked = true;
        pinError = '';
        pinInput = '';
      } else {
        pinError = 'Invalid PIN';
      }
    } catch (err) {
      console.error('PIN verification failed:', err);
      pinError = 'Verification failed';
    }
  }

  // Fix images for this location
  async function fixLocationImages() {
    if (!window.electronAPI?.media?.fixLocationImages) {
      fixMessage = 'Not available';
      return;
    }

    try {
      fixingImages = true;
      fixMessage = 'Fixing images...';

      const result = await window.electronAPI.media.fixLocationImages(location.locid);

      if (result.total === 0) {
        fixMessage = 'No images to fix';
      } else {
        fixMessage = `Fixed ${result.fixed}/${result.total} images${result.errors > 0 ? ` (${result.errors} errors)` : ''}`;
      }

      setTimeout(() => { fixMessage = ''; }, 5000);
    } catch (err) {
      console.error('Fix images failed:', err);
      fixMessage = 'Failed';
    } finally {
      fixingImages = false;
    }
  }

  // Fix videos for this location
  async function fixLocationVideos() {
    if (!window.electronAPI?.media?.fixLocationVideos) {
      fixMessage = 'Not available';
      return;
    }

    try {
      fixingVideos = true;
      fixMessage = 'Fixing videos...';

      const result = await window.electronAPI.media.fixLocationVideos(location.locid);

      if (result.total === 0) {
        fixMessage = 'No videos to fix';
      } else {
        fixMessage = `Fixed ${result.fixed}/${result.total} videos${result.errors > 0 ? ` (${result.errors} errors)` : ''}`;
      }

      setTimeout(() => { fixMessage = ''; }, 5000);
    } catch (err) {
      console.error('Fix videos failed:', err);
      fixMessage = 'Failed';
    } finally {
      fixingVideos = false;
    }
  }

  // Delete location
  async function deleteLocation() {
    if (!window.electronAPI?.locations?.delete) return;

    try {
      deleting = true;
      await window.electronAPI.locations.delete(location.locid);
      showDeleteConfirm = false;
      goto('/locations');
    } catch (err) {
      console.error('Delete location failed:', err);
      alert('Failed to delete location');
    } finally {
      deleting = false;
    }
  }
</script>

<div class="mt-6 bg-white rounded-lg shadow">
  <button
    onclick={() => isOpen = !isOpen}
    aria-expanded={isOpen}
    class="w-full p-6 flex items-center justify-between text-left hover:bg-gray-50 transition-colors rounded-lg"
  >
    <h2 class="text-xl font-semibold text-foreground">Nerd Stats</h2>
    <svg
      class="w-5 h-5 text-gray-400 transition-transform duration-200 {isOpen ? 'rotate-180' : ''}"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {#if isOpen}
  <div class="px-6 pb-6">
  <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
    <!-- IDs -->
    <div class="col-span-full border-b pb-3 mb-2">
      <p class="text-xs font-semibold text-gray-400 uppercase mb-2">Identifiers</p>
    </div>
    <div>
      <span class="text-gray-500">Full Location ID:</span>
      <button
        onclick={() => copyToClipboard(location.locid, 'locid')}
        class="ml-2 font-mono text-xs text-accent hover:underline"
        title="Click to copy"
      >
        {copiedField === 'locid' ? 'Copied!' : location.locid}
      </button>
    </div>
    <div>
      <span class="text-gray-500">Short ID (loc12):</span>
      <button
        onclick={() => copyToClipboard(location.loc12, 'loc12')}
        class="ml-2 font-mono text-xs text-accent hover:underline"
        title="Click to copy"
      >
        {copiedField === 'loc12' ? 'Copied!' : location.loc12}
      </button>
    </div>
    {#if location.slocnam}
      <div>
        <span class="text-gray-500">Short Name:</span>
        <span class="ml-2 font-mono text-xs">{location.slocnam}</span>
      </div>
    {/if}

    <!-- Timestamps -->
    <div class="col-span-full border-b pb-3 mb-2 mt-5">
      <p class="text-xs font-semibold text-gray-400 uppercase mb-2">Timestamps</p>
    </div>
    {#if location.locadd}
      <div>
        <span class="text-gray-500">Created:</span>
        <span class="ml-2">{new Date(location.locadd).toLocaleString()}</span>
      </div>
    {/if}
    {#if location.locup}
      <div>
        <span class="text-gray-500">Last Updated:</span>
        <span class="ml-2">{new Date(location.locup).toLocaleString()}</span>
      </div>
    {/if}
    {#if location.auth_imp}
      <div>
        <span class="text-gray-500">Author:</span>
        <span class="ml-2">{location.auth_imp}</span>
      </div>
    {/if}

    <!-- View Tracking (Migration 34: Per-user tracking) -->
    <div class="col-span-full border-b pb-3 mb-2 mt-5">
      <p class="text-xs font-semibold text-gray-400 uppercase mb-2">Activity</p>
    </div>
    <div>
      <span class="text-gray-500">Total Views:</span>
      <span class="ml-2 font-semibold">{viewStats?.totalViews ?? location.viewCount ?? 0}</span>
    </div>
    {#if viewStats}
      <div>
        <span class="text-gray-500">Unique Viewers:</span>
        <span class="ml-2 font-semibold">{viewStats.uniqueViewers}</span>
      </div>
    {/if}
    {#if viewStats?.lastViewedAt || location.lastViewedAt}
      <div>
        <span class="text-gray-500">Last Viewed:</span>
        <span class="ml-2">{new Date(viewStats?.lastViewedAt ?? location.lastViewedAt!).toLocaleString()}</span>
      </div>
    {/if}
    {#if viewStats?.recentViewers && viewStats.recentViewers.length > 0}
      <div class="col-span-full mt-3">
        <span class="text-gray-500">Recent Viewers:</span>
        <div class="mt-2 flex flex-wrap gap-2">
          {#each viewStats.recentViewers.slice(0, 5) as viewer}
            <span class="inline-flex items-center px-2 py-1 bg-gray-100 rounded text-xs">
              {viewer.display_name || viewer.username}
              <span class="ml-1 text-gray-400">({viewer.view_count})</span>
            </span>
          {/each}
        </div>
      </div>
    {/if}
    {#if loadingViewStats}
      <div class="col-span-full text-xs text-gray-400">Loading view details...</div>
    {/if}

    <!-- GPS Details -->
    {#if location.gps}
      <div class="col-span-full border-b pb-3 mb-2 mt-5">
        <p class="text-xs font-semibold text-gray-400 uppercase mb-2">GPS Details</p>
      </div>
      <div>
        <span class="text-gray-500">GPS Source:</span>
        <span class="ml-2 capitalize">{location.gps.source?.replace(/_/g, ' ')}</span>
      </div>
      <div>
        <span class="text-gray-500">Map Verified:</span>
        <span class="ml-2">{location.gps.verifiedOnMap ? 'Yes' : 'No'}</span>
      </div>
      {#if location.gps.accuracy}
        <div>
          <span class="text-gray-500">GPS Accuracy:</span>
          <span class="ml-2">{location.gps.accuracy}m</span>
        </div>
      {/if}
      {#if location.gps.capturedAt}
        <div>
          <span class="text-gray-500">GPS Captured:</span>
          <span class="ml-2">{new Date(location.gps.capturedAt).toLocaleString()}</span>
        </div>
      {/if}
    {/if}

    <!-- Media Counts -->
    <div class="col-span-full border-b pb-3 mb-2 mt-5">
      <p class="text-xs font-semibold text-gray-400 uppercase mb-2">Media Statistics</p>
    </div>
    <div>
      <span class="text-gray-500">Images:</span>
      <span class="ml-2 font-semibold">{imageCount}</span>
    </div>
    <div>
      <span class="text-gray-500">Videos:</span>
      <span class="ml-2 font-semibold">{videoCount}</span>
    </div>
    <div>
      <span class="text-gray-500">Documents:</span>
      <span class="ml-2 font-semibold">{documentCount}</span>
    </div>
    <div>
      <span class="text-gray-500">Total Media:</span>
      <span class="ml-2 font-semibold">{imageCount + videoCount + documentCount}</span>
    </div>

    <!-- Regions -->
    {#if location.regions && location.regions.length > 0}
      <div class="col-span-full border-b pb-3 mb-2 mt-5">
        <p class="text-xs font-semibold text-gray-400 uppercase mb-2">Classification</p>
      </div>
      <div class="col-span-full">
        <span class="text-gray-500">Regions:</span>
        <span class="ml-2">{location.regions.join(', ')}</span>
      </div>
    {/if}
  </div>
  </div>
  {/if}
</div>

<!-- Location Settings Section (collapsed by default, PIN-protected) -->
<div class="mt-6 bg-white rounded-lg shadow">
  <button
    onclick={() => settingsOpen = !settingsOpen}
    aria-expanded={settingsOpen}
    class="w-full p-6 flex items-center justify-between text-left hover:bg-gray-50 transition-colors rounded-lg"
  >
    <h2 class="text-xl font-semibold text-foreground">Location Settings</h2>
    <svg
      class="w-5 h-5 text-gray-400 transition-transform duration-200 {settingsOpen ? 'rotate-180' : ''}"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {#if settingsOpen}
  <div class="px-6 pb-6">
    {#if !settingsUnlocked}
      <!-- PIN Entry -->
      <div class="flex items-center gap-3">
        <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span class="text-sm text-gray-600">Enter PIN to unlock settings</span>
      </div>
      <div class="mt-3 flex items-center gap-3">
        <input
          type="password"
          inputmode="numeric"
          pattern="[0-9]*"
          maxlength="6"
          bind:value={pinInput}
          placeholder="PIN"
          onkeydown={(e) => e.key === 'Enter' && verifyPin()}
          class="w-24 px-3 py-2 text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          onclick={verifyPin}
          class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition"
        >
          Unlock
        </button>
        {#if pinError}
          <span class="text-sm text-red-500">{pinError}</span>
        {/if}
      </div>
    {:else}
      <!-- Unlocked Settings -->
      <div class="space-y-4">
        <!-- Fix Media Buttons -->
        <div class="flex flex-wrap items-center gap-3">
          <button
            onclick={fixLocationImages}
            disabled={fixingImages || fixingVideos}
            class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
          >
            {fixingImages ? 'Fixing...' : 'Fix Images'}
          </button>
          <button
            onclick={fixLocationVideos}
            disabled={fixingImages || fixingVideos}
            class="px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition disabled:opacity-50"
          >
            {fixingVideos ? 'Fixing...' : 'Fix Videos'}
          </button>
          {#if onEdit}
            <button
              onclick={onEdit}
              class="px-4 py-2 bg-gray-600 text-white rounded hover:opacity-90 transition"
            >
              Edit Location
            </button>
          {/if}
          {#if fixMessage}
            <span class="text-sm text-gray-600">{fixMessage}</span>
          {/if}
        </div>

        <!-- Delete Section -->
        <div class="pt-4 border-t border-gray-200">
          {#if !showDeleteConfirm}
            <button
              onclick={() => showDeleteConfirm = true}
              class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
            >
              Delete Location
            </button>
          {:else}
            <div class="bg-red-50 border border-red-200 rounded-lg p-4">
              <p class="font-medium text-red-800 mb-2">Delete "{location.locnam}"?</p>
              <p class="text-sm text-red-600 mb-4">
                This action cannot be undone. Media files will remain on disk.
              </p>
              <div class="flex gap-3">
                <button
                  onclick={() => showDeleteConfirm = false}
                  disabled={deleting}
                  class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition"
                >
                  Cancel
                </button>
                <button
                  onclick={deleteLocation}
                  disabled={deleting}
                  class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
  {/if}
</div>
