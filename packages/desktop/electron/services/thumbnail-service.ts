import sharp from 'sharp';
import fs from 'fs/promises';
import { MediaPathService } from './media-path-service';

/**
 * ThumbnailService - Generate thumbnails from images using Sharp
 *
 * Core Rules (DO NOT BREAK):
 * 1. Size is 256px - Matches MediaGrid cell size
 * 2. Output is ALWAYS JPEG - Browser compatibility, smaller than PNG
 * 3. Quality is 80 - Tested balance of quality vs size
 * 4. Never throw, return null - Import must not fail because thumbnail failed
 * 5. Hash bucketing - Store as .thumbnails/a3/a3d5e8f9...jpg
 * 6. Sharp only - Do not add ImageMagick, GraphicsMagick, Jimp, etc.
 */
export class ThumbnailService {
  private readonly DEFAULT_SIZE = 256;
  private readonly JPEG_QUALITY = 80;

  constructor(private readonly mediaPathService: MediaPathService) {}

  /**
   * Generate a thumbnail for an image file
   *
   * @param sourcePath - Absolute path to source image
   * @param hash - SHA256 hash of the file (for naming)
   * @returns Absolute path to generated thumbnail, or null on failure
   */
  async generateThumbnail(sourcePath: string, hash: string): Promise<string | null> {
    try {
      const thumbPath = this.mediaPathService.getThumbnailPath(hash);

      // Check if thumbnail already exists
      try {
        await fs.access(thumbPath);
        return thumbPath; // Already exists
      } catch {
        // Doesn't exist, continue to generate
      }

      // Ensure bucket directory exists
      await this.mediaPathService.ensureBucketDir(
        this.mediaPathService.getThumbnailDir(),
        hash
      );

      // Generate thumbnail using Sharp
      await sharp(sourcePath)
        .resize(this.DEFAULT_SIZE, this.DEFAULT_SIZE, {
          fit: 'cover',
          position: 'center',
        })
        .jpeg({ quality: this.JPEG_QUALITY })
        .toFile(thumbPath);

      return thumbPath;
    } catch (error) {
      // Log but don't throw - import should not fail due to thumbnail failure
      console.error(`[ThumbnailService] Failed to generate thumbnail for ${sourcePath}:`, error);
      return null;
    }
  }

  /**
   * Generate thumbnails for multiple images
   * Non-blocking - failures don't stop other thumbnails
   */
  async generateBatch(
    items: Array<{ sourcePath: string; hash: string }>
  ): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>();

    for (const item of items) {
      const result = await this.generateThumbnail(item.sourcePath, item.hash);
      results.set(item.hash, result);
    }

    return results;
  }

  /**
   * Check if a thumbnail exists for a given hash
   */
  async thumbnailExists(hash: string): Promise<boolean> {
    try {
      const thumbPath = this.mediaPathService.getThumbnailPath(hash);
      await fs.access(thumbPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a thumbnail by hash
   */
  async deleteThumbnail(hash: string): Promise<boolean> {
    try {
      const thumbPath = this.mediaPathService.getThumbnailPath(hash);
      await fs.unlink(thumbPath);
      return true;
    } catch {
      return false;
    }
  }
}
