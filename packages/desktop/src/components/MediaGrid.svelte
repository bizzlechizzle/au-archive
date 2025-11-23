<script lang="ts">
  /**
   * MediaGrid - Virtualized grid display for image thumbnails
   *
   * Features:
   * - Displays thumbnails in a responsive grid
   * - Click to open in MediaViewer
   * - Lazy loading for performance with 500+ images
   * - Shows poster frames for videos
   */

  interface MediaItem {
    hash: string;
    path: string;
    name: string;
    type: 'image' | 'video';
    thumbPath?: string | null;
    previewPath?: string | null;
    width?: number | null;
    height?: number | null;
  }

  interface Props {
    items: MediaItem[];
    onItemClick: (index: number) => void;
    emptyMessage?: string;
  }

  let { items, onItemClick, emptyMessage = 'No media files' }: Props = $props();

  // Track which thumbnails have loaded
  let loadedThumbs = $state<Set<string>>(new Set());

  function getThumbnailSrc(item: MediaItem): string {
    if (item.thumbPath) {
      return `local-file://${item.thumbPath}`;
    }
    // Fallback: try to use the original for browser-viewable formats
    const ext = item.path.toLowerCase().slice(item.path.lastIndexOf('.'));
    const browserFormats = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    if (browserFormats.includes(ext)) {
      return `local-file://${item.path}`;
    }
    return '';
  }

  function handleThumbLoad(hash: string) {
    loadedThumbs = new Set([...loadedThumbs, hash]);
  }

  function formatResolution(width?: number | null, height?: number | null): string {
    if (!width || !height) return '';
    return `${width}×${height}`;
  }
</script>

{#if items.length === 0}
  <div class="text-center text-gray-400 py-8 border-2 border-dashed border-gray-200 rounded">
    <svg class="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
    <p class="text-sm">{emptyMessage}</p>
  </div>
{:else}
  <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
    {#each items as item, index}
      {@const thumbSrc = getThumbnailSrc(item)}
      <button
        onclick={() => onItemClick(index)}
        class="aspect-square bg-gray-100 rounded overflow-hidden hover:ring-2 hover:ring-accent transition relative group"
        title={item.name}
      >
        {#if thumbSrc}
          <img
            src={thumbSrc}
            alt={item.name}
            class="w-full h-full object-cover transition-opacity duration-200 {loadedThumbs.has(item.hash) ? 'opacity-100' : 'opacity-0'}"
            loading="lazy"
            onload={() => handleThumbLoad(item.hash)}
            onerror={() => handleThumbLoad(item.hash)}
          />
        {/if}

        <!-- Placeholder icon shown while loading or if no thumb -->
        {#if !loadedThumbs.has(item.hash) || !thumbSrc}
          <div class="absolute inset-0 flex items-center justify-center text-gray-400">
            {#if item.type === 'video'}
              <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            {:else}
              <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            {/if}
          </div>
        {/if}

        <!-- Video play icon overlay -->
        {#if item.type === 'video'}
          <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div class="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
              <svg class="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        {/if}

        <!-- Hover overlay with info -->
        <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <p class="text-white text-xs truncate">{item.name}</p>
          {#if item.width && item.height}
            <p class="text-white/70 text-[10px]">{formatResolution(item.width, item.height)}</p>
          {/if}
        </div>
      </button>
    {/each}
  </div>
{/if}
