import { MediaCacheService } from './media-cache-service';

/**
 * PreloadService - Preload adjacent images when viewing in lightbox
 *
 * Core Rules (DO NOT BREAK):
 * 1. Preload ahead more than behind - Users typically move forward
 * 2. Cancellable - Stop preloading when user navigates away
 * 3. Non-blocking - Never block the UI thread
 * 4. Separate from cache - This service predicts, cache stores
 */

interface MediaItem {
  hash: string;
  path: string;
}

export class PreloadService {
  private currentIndex: number = -1;
  private mediaList: MediaItem[] = [];
  private abortController: AbortController | null = null;

  constructor(private readonly cacheService: MediaCacheService) {}

  /**
   * Set the current viewing position and media list
   * Call this when user opens or navigates in lightbox
   */
  setCurrentIndex(index: number, mediaList: MediaItem[]): void {
    this.currentIndex = index;
    this.mediaList = mediaList;

    // Cancel any in-progress preloading
    this.cancelPreload();

    // Start preloading adjacent images
    this.preloadAdjacent();
  }

  /**
   * Preload images adjacent to current position
   *
   * @param ahead - Number of images to preload ahead (default: 3)
   * @param behind - Number of images to preload behind (default: 1)
   */
  async preloadAdjacent(ahead: number = 3, behind: number = 1): Promise<void> {
    if (this.currentIndex < 0 || this.mediaList.length === 0) {
      return;
    }

    // Create new abort controller
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Build list of items to preload
    const toPreload: MediaItem[] = [];

    // Add items ahead
    for (let i = 1; i <= ahead; i++) {
      const idx = this.currentIndex + i;
      if (idx < this.mediaList.length) {
        toPreload.push(this.mediaList[idx]);
      }
    }

    // Add items behind
    for (let i = 1; i <= behind; i++) {
      const idx = this.currentIndex - i;
      if (idx >= 0) {
        toPreload.push(this.mediaList[idx]);
      }
    }

    // Preload each item (abort if cancelled)
    await this.cacheService.preload(
      toPreload.filter(() => !signal.aborted)
    );
  }

  /**
   * Cancel any in-progress preloading
   * Call when user closes lightbox or navigates to different location
   */
  cancelPreload(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Clear state (call when closing lightbox)
   */
  reset(): void {
    this.cancelPreload();
    this.currentIndex = -1;
    this.mediaList = [];
  }
}

// Factory function
export function createPreloadService(cacheService: MediaCacheService): PreloadService {
  return new PreloadService(cacheService);
}
