<script lang="ts">
  /**
   * LocationNerdStats - Technical metadata (IDs, timestamps, GPS details, counts)
   * Per LILBITS: ~150 lines, single responsibility
   * Migration 34: Enhanced with per-user view tracking
   */
  import type { Location } from '@au-archive/core';

  interface Props {
    location: Location;
    imageCount: number;
    videoCount: number;
    documentCount: number;
  }

  let { location, imageCount, videoCount, documentCount }: Props = $props();

  let isOpen = $state(false);
  let copiedField = $state<string | null>(null);

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
