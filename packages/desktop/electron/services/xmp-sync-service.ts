import { XmpService, XmpData } from './xmp-service';

/**
 * XmpSyncService - Background sync between SQLite and XMP sidecars
 *
 * Core Rules (DO NOT BREAK):
 * 1. XMP is source of truth - On conflict, XMP wins
 * 2. Queue-based - Don't block UI for XMP writes
 * 3. Idempotent - Safe to call sync multiple times
 * 4. Disaster recovery - Can rebuild SQLite from XMP sidecars
 */

interface SyncQueueItem {
  hash: string;
  type: 'image' | 'video';
  mediaPath: string;
  data: XmpData;
}

export class XmpSyncService {
  private queue: SyncQueueItem[] = [];
  private isProcessing: boolean = false;

  constructor(private readonly xmpService: XmpService) {}

  /**
   * Queue a media item for XMP sync
   * Called when metadata changes in the app
   */
  queueSync(item: SyncQueueItem): void {
    // Remove any existing queue item for same hash (take latest)
    this.queue = this.queue.filter(q => q.hash !== item.hash);
    this.queue.push(item);

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Process the sync queue
   * Runs in background, processes items one at a time
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;

      try {
        await this.xmpService.writeSidecar(item.mediaPath, item.data);
        console.log('[XmpSync] Synced:', item.hash);
      } catch (error) {
        console.error('[XmpSync] Failed to sync:', item.hash, error);
        // Don't re-queue on failure - would cause infinite loop
      }

      // Small delay between writes to prevent disk thrashing
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    this.isProcessing = false;
  }

  /**
   * Sync all pending items immediately
   * Blocks until complete
   */
  async syncAll(): Promise<{ synced: number; errors: number }> {
    let synced = 0;
    let errors = 0;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;

      try {
        await this.xmpService.writeSidecar(item.mediaPath, item.data);
        synced++;
      } catch (error) {
        console.error('[XmpSync] Failed to sync:', item.hash, error);
        errors++;
      }
    }

    return { synced, errors };
  }

  /**
   * Get current queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Check if sync is in progress
   */
  isSyncing(): boolean {
    return this.isProcessing;
  }
}

// Factory function
export function createXmpSyncService(xmpService: XmpService): XmpSyncService {
  return new XmpSyncService(xmpService);
}
