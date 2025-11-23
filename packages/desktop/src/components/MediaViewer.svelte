<script lang="ts">
  /**
   * MediaViewer - Full-screen lightbox for viewing images and videos
   *
   * Features:
   * - Displays images via native <img> (standard formats)
   * - Displays RAW previews extracted by ExifTool
   * - Keyboard navigation (arrow keys, Escape to close)
   * - Shows EXIF panel on hover/click
   */

  interface Props {
    mediaList: Array<{
      hash: string;
      path: string;
      thumbPath?: string | null;
      previewPath?: string | null;
      type: 'image' | 'video';
      name?: string;
    }>;
    initialIndex: number;
    onClose: () => void;
    onIndexChange?: (index: number) => void;
  }

  let { mediaList, initialIndex, onClose, onIndexChange }: Props = $props();

  let currentIndex = $state(initialIndex);
  let showExifPanel = $state(false);
  let imageLoaded = $state(false);
  let imageSrc = $state<string>('');

  const currentItem = $derived(mediaList[currentIndex]);
  const hasNext = $derived(currentIndex < mediaList.length - 1);
  const hasPrev = $derived(currentIndex > 0);

  // Standard browser-viewable formats
  const BROWSER_FORMATS = new Set([
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico',
    '.mp4', '.webm', '.ogg', '.mov'
  ]);

  // Determine the best source to display
  $effect(() => {
    if (!currentItem) return;

    const ext = currentItem.path.toLowerCase().slice(currentItem.path.lastIndexOf('.'));
    const isBrowserViewable = BROWSER_FORMATS.has(ext);

    if (isBrowserViewable) {
      // Use original file for browser-viewable formats
      imageSrc = `local-file://${currentItem.path}`;
    } else if (currentItem.previewPath) {
      // Use extracted preview for RAW files
      imageSrc = `local-file://${currentItem.previewPath}`;
    } else if (currentItem.thumbPath) {
      // Fallback to thumbnail
      imageSrc = `local-file://${currentItem.thumbPath}`;
    } else {
      // No displayable source
      imageSrc = '';
    }

    imageLoaded = false;
  });

  // Navigate to next image
  function next() {
    if (hasNext) {
      currentIndex++;
      onIndexChange?.(currentIndex);
    }
  }

  // Navigate to previous image
  function prev() {
    if (hasPrev) {
      currentIndex--;
      onIndexChange?.(currentIndex);
    }
  }

  // Handle keyboard navigation
  function handleKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        prev();
        break;
      case 'Escape':
        onClose();
        break;
      case 'i':
        showExifPanel = !showExifPanel;
        break;
    }
  }

  // Open in external viewer
  async function openExternal() {
    if (currentItem) {
      await window.electronAPI.media.openFile(currentItem.path);
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="fixed inset-0 bg-black/95 z-50 flex items-center justify-center"
  role="dialog"
  aria-modal="true"
>
  <!-- Close button -->
  <button
    onclick={onClose}
    class="absolute top-4 right-4 text-white/80 hover:text-white transition z-10"
    aria-label="Close viewer"
  >
    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
    </svg>
  </button>

  <!-- Open External button -->
  <button
    onclick={openExternal}
    class="absolute top-4 left-4 px-4 py-2 bg-white/20 text-white rounded hover:bg-white/30 transition z-10 text-sm"
  >
    Open in System Viewer
  </button>

  <!-- Info toggle -->
  <button
    onclick={() => showExifPanel = !showExifPanel}
    class="absolute top-4 left-48 px-4 py-2 bg-white/20 text-white rounded hover:bg-white/30 transition z-10 text-sm"
  >
    {showExifPanel ? 'Hide Info' : 'Show Info'} (i)
  </button>

  <!-- Navigation arrows -->
  {#if hasPrev}
    <button
      onclick={prev}
      class="absolute left-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition z-10"
      aria-label="Previous image"
    >
      <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  {/if}

  {#if hasNext}
    <button
      onclick={next}
      class="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition z-10"
      aria-label="Next image"
    >
      <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  {/if}

  <!-- Image counter -->
  <div class="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm z-10">
    {currentIndex + 1} / {mediaList.length}
  </div>

  <!-- Main content area -->
  <div class="max-w-[90vw] max-h-[90vh] flex items-center justify-center">
    {#if currentItem}
      {#if currentItem.type === 'video'}
        <video
          src={`local-file://${currentItem.path}`}
          controls
          autoplay
          class="max-w-full max-h-[90vh] object-contain"
        />
      {:else if imageSrc}
        <img
          src={imageSrc}
          alt={currentItem.name || 'Image'}
          class="max-w-full max-h-[90vh] object-contain transition-opacity duration-200 {imageLoaded ? 'opacity-100' : 'opacity-0'}"
          onload={() => imageLoaded = true}
          onerror={() => imageLoaded = false}
        />
        {#if !imageLoaded}
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="text-white/60">Loading...</div>
          </div>
        {/if}
      {:else}
        <div class="text-white/60 text-center">
          <p class="text-lg mb-2">Preview not available</p>
          <p class="text-sm">Click "Open in System Viewer" to view this file</p>
        </div>
      {/if}
    {/if}
  </div>

  <!-- EXIF Panel (slide in from right) -->
  {#if showExifPanel && currentItem}
    <div class="absolute right-0 top-0 bottom-0 w-80 bg-black/80 text-white overflow-y-auto p-4">
      <h3 class="text-lg font-semibold mb-4">Image Info</h3>
      <dl class="space-y-2 text-sm">
        <div>
          <dt class="text-white/60">Filename</dt>
          <dd class="font-mono text-xs break-all">{currentItem.name || currentItem.hash}</dd>
        </div>
        <div>
          <dt class="text-white/60">SHA256</dt>
          <dd class="font-mono text-xs break-all">{currentItem.hash}</dd>
        </div>
        <div>
          <dt class="text-white/60">Path</dt>
          <dd class="font-mono text-xs break-all">{currentItem.path}</dd>
        </div>
      </dl>
    </div>
  {/if}
</div>
