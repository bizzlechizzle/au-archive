import fs from 'fs/promises';
import path from 'path';
import { MediaPathService } from './media-path-service';
import { FFmpegService } from './ffmpeg-service';

/**
 * PosterFrameService - Generate poster frames (thumbnails) for videos using FFmpeg
 *
 * Core Rules (DO NOT BREAK):
 * 1. Extract at 1 second by default - First frame is often black/title
 * 2. Output is ALWAYS JPEG - Browser compatibility
 * 3. Never throw, return null - Import must not fail because poster failed
 * 4. Hash bucketing - Store as .posters/a3/a3d5e8f9...jpg
 * 5. FFmpeg only - Already installed, no additional dependencies
 */
export class PosterFrameService {
  private readonly DEFAULT_TIMESTAMP = 1; // seconds
  private readonly OUTPUT_SIZE = 256; // Match thumbnail size

  constructor(
    private readonly pathService: MediaPathService,
    private readonly ffmpegService: FFmpegService
  ) {}

  /**
   * Generate a poster frame (thumbnail) for a video file
   *
   * @param sourcePath - Absolute path to video file
   * @param hash - SHA256 hash of file (used for output filename)
   * @param timestampSeconds - Time offset to capture (default: 1 second)
   * @returns Absolute path to generated poster, or null on failure
   */
  async generatePosterFrame(
    sourcePath: string,
    hash: string,
    timestampSeconds: number = this.DEFAULT_TIMESTAMP
  ): Promise<string | null> {
    try {
      const outputPath = this.pathService.getPosterPath(hash);
      const outputDir = path.dirname(outputPath);

      // Ensure bucket directory exists
      await fs.mkdir(outputDir, { recursive: true });

      // Generate poster frame using FFmpeg
      await this.ffmpegService.extractFrame(sourcePath, outputPath, timestampSeconds, this.OUTPUT_SIZE);

      // Verify output exists
      await fs.access(outputPath);

      return outputPath;
    } catch (error) {
      console.warn('[PosterFrameService] Failed to generate poster:', sourcePath, error);
      return null;
    }
  }

  /**
   * Check if poster already exists for a hash
   */
  async posterExists(hash: string): Promise<boolean> {
    try {
      const posterPath = this.pathService.getPosterPath(hash);
      await fs.access(posterPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get poster path if it exists, null otherwise
   */
  async getPosterIfExists(hash: string): Promise<string | null> {
    const posterPath = this.pathService.getPosterPath(hash);
    try {
      await fs.access(posterPath);
      return posterPath;
    } catch {
      return null;
    }
  }
}

// Factory function
export function createPosterFrameService(
  pathService: MediaPathService,
  ffmpegService: FFmpegService
): PosterFrameService {
  return new PosterFrameService(pathService, ffmpegService);
}
