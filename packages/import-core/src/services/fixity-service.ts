/**
 * Fixity Service
 *
 * Verifies archive integrity by re-checking file hashes.
 * Essential for archive-grade data integrity.
 *
 * @module services/fixity-service
 */

import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { randomUUID } from 'crypto';
import type { StorageAdapter } from '../adapters/storage.js';
import type { DatabaseAdapter, FixityRecord, FixityStatus } from '../adapters/database.js';
import type { MediaType } from '../domain/media.js';

export interface FixityServiceDependencies {
  storage: StorageAdapter;
  database: DatabaseAdapter;
}

export interface VerifyOptions {
  /** Verify specific location only */
  locationId?: string;
  /** Verify all files in archive */
  all?: boolean;
  /** Verify random sample of n files */
  sampleSize?: number;
  /** Only check files not verified since this date */
  notVerifiedSince?: Date;
  /** Actor performing verification */
  actor?: string;
}

export interface VerifyResult {
  checked: number;
  valid: number;
  corrupted: number;
  missing: number;
  errors: number;
  duration: number;
  corruptedFiles: FixityRecord[];
}

/**
 * Fixity Service
 *
 * Provides archive integrity verification by comparing
 * stored hashes against actual file contents.
 */
export class FixityService {
  constructor(private readonly deps: FixityServiceDependencies) {}

  /**
   * Verify archive integrity.
   *
   * @param options - Verification options
   * @returns Verification result with statistics
   */
  async verify(options: VerifyOptions = {}): Promise<VerifyResult> {
    const startTime = Date.now();
    const actor = options.actor || 'system:manual';

    const result: VerifyResult = {
      checked: 0,
      valid: 0,
      corrupted: 0,
      missing: 0,
      errors: 0,
      duration: 0,
      corruptedFiles: [],
    };

    // Get files to verify
    const files = await this.getFilesToVerify(options);

    // Verify each file
    for (const file of files) {
      const checkResult = await this.verifyFile(file, actor);
      result.checked++;

      switch (checkResult.status) {
        case 'valid':
          result.valid++;
          break;
        case 'corrupted':
          result.corrupted++;
          result.corruptedFiles.push(checkResult);
          break;
        case 'missing':
          result.missing++;
          result.corruptedFiles.push(checkResult);
          break;
        case 'error':
          result.errors++;
          break;
      }
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Verify a single file.
   */
  async verifyFile(
    file: { sha: string; type: MediaType; path: string },
    actor: string
  ): Promise<FixityRecord> {
    const checkId = randomUUID();
    const now = new Date().toISOString();

    let status: FixityStatus = 'valid';
    let actualHash = '';
    let actualSize: number | undefined;
    let errorMessage: string | undefined;

    try {
      // Check if file exists
      const exists = await this.deps.storage.exists(file.path);
      if (!exists) {
        status = 'missing';
        errorMessage = 'File not found at archive path';
      } else {
        // Get file size
        const stat = await this.deps.storage.stat(file.path);
        actualSize = stat.size;

        // Calculate hash
        actualHash = await this.calculateHash(file.path);

        // Compare
        if (actualHash !== file.sha) {
          status = 'corrupted';
          errorMessage = `Hash mismatch: expected ${file.sha.slice(0, 16)}..., got ${actualHash.slice(0, 16)}...`;
        }
      }
    } catch (error) {
      status = 'error';
      errorMessage = error instanceof Error ? error.message : 'Unknown error';
    }

    // Create fixity record
    const record: FixityRecord = {
      checkId,
      mediaSha: file.sha,
      mediaType: file.type,
      filePath: file.path,
      checkedAt: now,
      checkedBy: actor,
      expectedHash: file.sha,
      actualHash: actualHash || '',
      status,
      actualSize,
      errorMessage,
    };

    // Save to database
    await this.deps.database.insertFixityCheck(record);

    return record;
  }

  /**
   * Get files needing verification based on options.
   */
  private async getFilesToVerify(
    options: VerifyOptions
  ): Promise<Array<{ sha: string; type: MediaType; path: string }>> {
    if (options.sampleSize && options.notVerifiedSince) {
      return this.deps.database.getFilesNeedingVerification(
        options.notVerifiedSince,
        options.sampleSize
      );
    }

    // TODO: Implement location-specific and full archive queries
    // For now, return files not verified in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return this.deps.database.getFilesNeedingVerification(
      thirtyDaysAgo,
      options.sampleSize || 100
    );
  }

  /**
   * Calculate SHA256 hash of a file.
   */
  private calculateHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Get all corrupted files from previous checks.
   */
  async getCorruptedFiles(): Promise<FixityRecord[]> {
    return this.deps.database.getCorruptedFiles();
  }
}
