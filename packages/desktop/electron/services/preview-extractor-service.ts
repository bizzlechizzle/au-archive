import fs from 'fs/promises';
import path from 'path';
import { MediaPathService } from './media-path-service';
import { ExifToolService } from './exiftool-service';

/**
 * PreviewExtractorService - Extract embedded JPEG previews from RAW files
 *
 * Core Rules (DO NOT BREAK):
 * 1. Extract previews, don't convert - ExifTool extraction is <1s vs 2-5s for full conversion
 * 2. Fallback chain: PreviewImage -> JpgFromRaw -> ThumbnailImage
 * 3. Never throw, return null - Import must not fail because preview failed
 * 4. Hash bucketing - Store as .previews/a3/a3d5e8f9...jpg
 * 5. ExifTool only - Do not add LibRaw, dcraw, or WASM decoders
 */
export class PreviewExtractorService {
  // RAW formats that contain embedded JPEG previews
  private readonly RAW_EXTENSIONS = new Set([
    '.nef', '.nrw',                    // Nikon
    '.cr2', '.cr3', '.crw',            // Canon
    '.arw', '.arq', '.srf', '.sr2',    // Sony
    '.dng',                            // Adobe DNG
    '.orf', '.ori',                    // Olympus
    '.raf',                            // Fujifilm
    '.rw2', '.raw', '.rwl',            // Panasonic/Leica
    '.pef', '.ptx',                    // Pentax
    '.srw',                            // Samsung
    '.x3f',                            // Sigma
    '.3fr', '.fff',                    // Hasselblad
    '.dcr', '.k25', '.kdc',            // Kodak
    '.mef', '.mos',                    // Mamiya/Leaf
    '.mrw',                            // Minolta
    '.erf',                            // Epson
    '.iiq',                            // Phase One
    '.gpr',                            // GoPro RAW
  ]);

  constructor(
    private readonly pathService: MediaPathService,
    private readonly exiftoolService: ExifToolService
  ) {}

  /**
   * Check if a file extension is a RAW format
   */
  isRawFormat(extension: string): boolean {
    return this.RAW_EXTENSIONS.has(extension.toLowerCase());
  }

  /**
   * Extract embedded JPEG preview from a RAW file
   *
   * Uses ExifTool's -b (binary) flag to extract the largest embedded preview.
   * Fallback chain: PreviewImage -> JpgFromRaw -> ThumbnailImage
   *
   * @param sourcePath - Absolute path to RAW file
   * @param hash - SHA256 hash of file (used for output filename)
   * @returns Absolute path to extracted preview, or null on failure
   */
  async extractPreview(sourcePath: string, hash: string): Promise<string | null> {
    try {
      const outputPath = this.pathService.getPreviewPath(hash);
      const outputDir = path.dirname(outputPath);

      // Ensure bucket directory exists
      await fs.mkdir(outputDir, { recursive: true });

      // Try extraction tags in order of preference (largest to smallest)
      const previewTags = ['PreviewImage', 'JpgFromRaw', 'ThumbnailImage'];

      for (const tag of previewTags) {
        const success = await this.tryExtractTag(sourcePath, tag, outputPath);
        if (success) {
          return outputPath;
        }
      }

      console.warn('[PreviewExtractor] No preview found in RAW file:', sourcePath);
      return null;
    } catch (error) {
      console.warn('[PreviewExtractor] Failed to extract preview:', sourcePath, error);
      return null;
    }
  }

  /**
   * Try to extract a specific preview tag from a RAW file
   */
  private async tryExtractTag(
    sourcePath: string,
    tag: string,
    outputPath: string
  ): Promise<boolean> {
    try {
      // Use ExifTool to extract binary data for the specified tag
      const previewData = await this.exiftoolService.extractBinaryTag(sourcePath, tag);

      if (previewData && previewData.length > 1000) {
        // Write preview to file
        await fs.writeFile(outputPath, previewData);

        // Verify it's a valid JPEG (starts with FFD8)
        const isValidJpeg = previewData[0] === 0xFF && previewData[1] === 0xD8;
        if (isValidJpeg) {
          return true;
        } else {
          // Invalid JPEG, clean up
          await fs.unlink(outputPath).catch(() => {});
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Check if preview already exists for a hash
   */
  async previewExists(hash: string): Promise<boolean> {
    try {
      const previewPath = this.pathService.getPreviewPath(hash);
      await fs.access(previewPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get preview path if it exists, null otherwise
   */
  async getPreviewIfExists(hash: string): Promise<string | null> {
    const previewPath = this.pathService.getPreviewPath(hash);
    try {
      await fs.access(previewPath);
      return previewPath;
    } catch {
      return null;
    }
  }
}

// Factory function
export function createPreviewExtractorService(
  pathService: MediaPathService,
  exiftoolService: ExifToolService
): PreviewExtractorService {
  return new PreviewExtractorService(pathService, exiftoolService);
}
