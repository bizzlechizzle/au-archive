import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
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

  constructor(private readonly pathService: MediaPathService) {}

  /**
   * Generate a thumbnail for a single image file
   *
   * @param sourcePath - Absolute path to source image
   * @param hash - SHA256 hash of file (used for output filename)
   * @returns Absolute path to generated thumbnail, or null on failure
   */
  async generateThumbnail(
    sourcePath: string,
    hash: string,
    size: number = this.DEFAULT_SIZE
  ): Promise<string | null> {
    try {
      const outputPath = this.pathService.getThumbnailPath(hash);
      const outputDir = path.dirname(outputPath);

      // Ensure bucket directory exists
      await fs.mkdir(outputDir, { recursive: true });

      // Generate thumbnail with Sharp
      // - resize: cover fit (crop to square, centered)
      // - jpeg: quality 80, progressive for better loading
      await sharp(sourcePath)
        .resize(size, size, {
          fit: 'cover',
          position: 'centre',
        })
        .jpeg({
          quality: this.JPEG_QUALITY,
          progressive: true,
        })
        .toFile(outputPath);

      return outputPath;
    } catch (error) {
      console.warn('[ThumbnailService] Failed to generate thumbnail:', sourcePath, error);
      return null;
    }
  }

  /**
   * Generate thumbnail from HEIC/HEIF (Apple format)
   * Sharp handles HEIC conversion automatically
   */
  async generateFromHeic(
    sourcePath: string,
    hash: string,
    size: number = this.DEFAULT_SIZE
  ): Promise<string | null> {
    // Sharp handles HEIC natively, same as other formats
    return this.generateThumbnail(sourcePath, hash, size);
  }

  /**
   * Check if thumbnail already exists for a hash
   */
  async thumbnailExists(hash: string): Promise<boolean> {
    try {
      const thumbPath = this.pathService.getThumbnailPath(hash);
      await fs.access(thumbPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get thumbnail path if it exists, null otherwise
   */
  async getThumbnailIfExists(hash: string): Promise<string | null> {
    const thumbPath = this.pathService.getThumbnailPath(hash);
    try {
      await fs.access(thumbPath);
      return thumbPath;
    } catch {
      return null;
    }
  }

  /**
   * Delete thumbnail for a hash (cleanup)
   */
  async deleteThumbnail(hash: string): Promise<boolean> {
    try {
      const thumbPath = this.pathService.getThumbnailPath(hash);
      await fs.unlink(thumbPath);
      return true;
    } catch {
      return false;
    }
  }
}

// Factory function
export function createThumbnailService(pathService: MediaPathService): ThumbnailService {
  return new ThumbnailService(pathService);
}
