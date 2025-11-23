import path from 'path';
import fs from 'fs/promises';

/**
 * MediaPathService - Centralized path utilities for media files
 *
 * Provides consistent paths for thumbnails, previews, posters, and XMP sidecars.
 * Uses hash bucketing to avoid filesystem limits (10k+ files in one directory).
 *
 * Path pattern: [baseDir]/[first2chars]/[sha256].[ext]
 * Example: .thumbnails/a3/a3d5e8f9...jpg
 */
export class MediaPathService {
  constructor(private readonly archivePath: string) {}

  // === Directory Getters ===

  getThumbnailDir(): string {
    return path.join(this.archivePath, '.thumbnails');
  }

  getPreviewDir(): string {
    return path.join(this.archivePath, '.previews');
  }

  getPosterDir(): string {
    return path.join(this.archivePath, '.posters');
  }

  getCacheDir(): string {
    return path.join(this.archivePath, '.cache');
  }

  // === Path Generators (with hash bucketing) ===

  getThumbnailPath(hash: string): string {
    return this.bucketPath(hash, this.getThumbnailDir(), '.jpg');
  }

  getPreviewPath(hash: string): string {
    return this.bucketPath(hash, this.getPreviewDir(), '.jpg');
  }

  getPosterPath(hash: string): string {
    return this.bucketPath(hash, this.getPosterDir(), '.jpg');
  }

  /**
   * Get XMP sidecar path for a media file
   * XMP sidecars are stored alongside the original file with same name + .xmp extension
   */
  getXmpSidecarPath(originalPath: string): string {
    const parsed = path.parse(originalPath);
    return path.join(parsed.dir, `${parsed.name}.xmp`);
  }

  // === Directory Management ===

  /**
   * Ensure all media directories exist
   * Call this during app initialization
   */
  async ensureDirectories(): Promise<void> {
    const dirs = [
      this.getThumbnailDir(),
      this.getPreviewDir(),
      this.getPosterDir(),
      this.getCacheDir(),
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Ensure bucket directory exists for a hash
   * Returns the bucket directory path
   */
  async ensureBucketDir(hash: string, baseDir: string): Promise<string> {
    const bucket = hash.substring(0, 2).toLowerCase();
    const bucketDir = path.join(baseDir, bucket);
    await fs.mkdir(bucketDir, { recursive: true });
    return bucketDir;
  }

  // === Private Helpers ===

  /**
   * Generate bucketed path: [baseDir]/[first2chars]/[hash].[ext]
   * This prevents filesystem slowdown with thousands of files in one directory
   */
  private bucketPath(hash: string, baseDir: string, ext: string): string {
    const bucket = hash.substring(0, 2).toLowerCase();
    return path.join(baseDir, bucket, `${hash}${ext}`);
  }
}

// Export singleton factory
let instance: MediaPathService | null = null;

export function getMediaPathService(archivePath: string): MediaPathService {
  if (!instance || instance['archivePath'] !== archivePath) {
    instance = new MediaPathService(archivePath);
  }
  return instance;
}
