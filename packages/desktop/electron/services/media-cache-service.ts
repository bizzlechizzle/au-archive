import fs from 'fs/promises';

/**
 * MediaCacheService - In-memory LRU cache for recently viewed images
 *
 * Core Rules (DO NOT BREAK):
 * 1. LRU eviction - When cache exceeds maxSizeMB, evict least recently used
 * 2. Size tracking - Track actual buffer sizes, not just count
 * 3. Async-safe - All operations are thread-safe
 * 4. Never throw - Return null on cache miss, log errors
 */

interface CacheEntry {
  data: Buffer;
  size: number;
  lastAccessed: number;
}

export class MediaCacheService {
  private cache: Map<string, CacheEntry> = new Map();
  private currentSizeBytes: number = 0;
  private hits: number = 0;
  private misses: number = 0;

  constructor(private readonly maxSizeMB: number = 100) {}

  /**
   * Get cached image data by hash
   * Returns null if not in cache (cache miss)
   */
  get(hash: string): Buffer | null {
    const entry = this.cache.get(hash);
    if (!entry) {
      this.misses++;
      return null;
    }

    // Update last accessed time (LRU)
    entry.lastAccessed = Date.now();
    this.hits++;
    return entry.data;
  }

  /**
   * Add image data to cache
   * Triggers LRU eviction if cache exceeds max size
   */
  set(hash: string, data: Buffer): void {
    const size = data.byteLength;

    // Don't cache if single item exceeds max size
    if (size > this.maxSizeBytes) {
      console.warn('[MediaCache] Item too large to cache:', hash, size);
      return;
    }

    // Remove existing entry if present
    if (this.cache.has(hash)) {
      const existing = this.cache.get(hash)!;
      this.currentSizeBytes -= existing.size;
    }

    // Evict LRU entries until we have space
    while (this.currentSizeBytes + size > this.maxSizeBytes) {
      this.evictLRU();
    }

    // Add new entry
    this.cache.set(hash, {
      data,
      size,
      lastAccessed: Date.now(),
    });
    this.currentSizeBytes += size;
  }

  /**
   * Preload multiple images into cache
   * Loads from disk and caches for fast access
   */
  async preload(paths: Array<{ hash: string; path: string }>): Promise<void> {
    for (const { hash, path } of paths) {
      // Skip if already cached
      if (this.cache.has(hash)) {
        continue;
      }

      try {
        const data = await fs.readFile(path);
        this.set(hash, data);
      } catch (error) {
        // Non-fatal - just skip this file
        console.warn('[MediaCache] Failed to preload:', path);
      }
    }
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.cache.clear();
    this.currentSizeBytes = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    sizeMB: number;
    count: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const total = this.hits + this.misses;
    return {
      sizeMB: this.currentSizeBytes / (1024 * 1024),
      count: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  // === Private Helpers ===

  private get maxSizeBytes(): number {
    return this.maxSizeMB * 1024 * 1024;
  }

  /**
   * Evict the least recently used entry
   */
  private evictLRU(): void {
    let oldestHash: string | null = null;
    let oldestTime = Infinity;

    for (const [hash, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestHash = hash;
      }
    }

    if (oldestHash) {
      const entry = this.cache.get(oldestHash)!;
      this.currentSizeBytes -= entry.size;
      this.cache.delete(oldestHash);
    }
  }
}

// Singleton instance
let instance: MediaCacheService | null = null;

export function getMediaCacheService(maxSizeMB: number = 100): MediaCacheService {
  if (!instance) {
    instance = new MediaCacheService(maxSizeMB);
  }
  return instance;
}
