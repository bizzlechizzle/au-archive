<script lang="ts">
  /**
   * SubLocationGrid - Grid of sub-location cards for host locations
   * Migration 28: Max 4 per row, click to navigate to sub-location detail
   */
  import { router } from '../../stores/router';

  interface SubLocation {
    subid: string;
    sub12: string;
    locid: string;
    subnam: string;
    ssubname: string | null;
    type: string | null;
    status: string | null;
    hero_imgsha: string | null;
    is_primary: boolean;
    hero_thumb_path?: string;
  }

  interface Props {
    locid: string;
    sublocations: SubLocation[];
    onAddSubLocation?: () => void;
  }

  let { locid, sublocations, onAddSubLocation }: Props = $props();

  function navigateToSubLocation(subid: string) {
    router.navigate(`/location/${locid}/sub/${subid}`);
  }
</script>

<section class="mt-8">
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-lg font-semibold text-foreground">Buildings & Structures</h2>
    {#if onAddSubLocation}
      <button
        onclick={onAddSubLocation}
        class="px-3 py-1.5 text-sm bg-accent text-white rounded hover:opacity-90 transition flex items-center gap-1"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Add Building
      </button>
    {/if}
  </div>

  {#if sublocations.length === 0}
    <div class="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
      <svg class="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
      <p class="text-gray-500 mb-2">No buildings added yet</p>
      <p class="text-sm text-gray-400">Add buildings to organize media by structure</p>
      {#if onAddSubLocation}
        <button
          onclick={onAddSubLocation}
          class="mt-4 px-4 py-2 bg-accent text-white rounded hover:opacity-90 transition"
        >
          Add First Building
        </button>
      {/if}
    </div>
  {:else}
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {#each sublocations as subloc}
        <button
          onclick={() => navigateToSubLocation(subloc.subid)}
          class="group bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md hover:border-accent/30 transition text-left"
        >
          <!-- Hero image or placeholder -->
          <div class="aspect-[4/3] bg-gray-100 relative overflow-hidden">
            {#if subloc.hero_thumb_path}
              <img
                src="file://{subloc.hero_thumb_path}"
                alt={subloc.subnam}
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            {:else}
              <div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                <svg class="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
            {/if}

            <!-- Primary badge -->
            {#if subloc.is_primary}
              <div class="absolute top-2 right-2 px-2 py-0.5 bg-amber-500 text-white text-xs font-medium rounded">
                Primary
              </div>
            {/if}
          </div>

          <!-- Content -->
          <div class="p-3">
            <h3 class="font-medium text-foreground truncate group-hover:text-accent transition">
              {subloc.subnam}
            </h3>
            {#if subloc.type || subloc.status}
              <p class="text-sm text-gray-500 truncate mt-0.5">
                {[subloc.type, subloc.status].filter(Boolean).join(' - ')}
              </p>
            {/if}
          </div>
        </button>
      {/each}

      <!-- Add card -->
      {#if onAddSubLocation}
        <button
          onclick={onAddSubLocation}
          class="group bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 hover:border-accent hover:bg-accent/5 transition min-h-[180px] flex flex-col items-center justify-center gap-2"
        >
          <svg class="w-8 h-8 text-gray-400 group-hover:text-accent transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          <span class="text-sm text-gray-500 group-hover:text-accent transition">Add Building</span>
        </button>
      {/if}
    </div>
  {/if}
</section>
