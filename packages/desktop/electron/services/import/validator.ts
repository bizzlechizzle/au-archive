/**
 * Validator - Post-copy integrity verification (Step 4)
 *
 * Per Import Spec v2.0:
 * - Parallel re-hash using WorkerPool
 * - Hash comparison
 * - Rollback on mismatch
 * - Continue-on-error (don't abort batch)
 * - Progress reporting (80-95%)
 *
 * @module services/import/validator
 */

import { promises as fs } from 'fs';
import type { CopiedFile } from './copier';
import { getWorkerPool, type WorkerPool } from '../worker-pool';

/**
 * Validation result for a single file
 */
export interface ValidatedFile extends CopiedFile {
  isValid: boolean;
  validationError: string | null;
}

/**
 * Validation result summary
 */
export interface ValidationResult {
  files: ValidatedFile[];
  totalValidated: number;
  totalValid: number;
  totalInvalid: number;
  totalRolledBack: number;
  validationTimeMs: number;
}

/**
 * Validator options
 */
export interface ValidatorOptions {
  /**
   * Progress callback (80-95% range)
   */
  onProgress?: (percent: number, currentFile: string) => void;

  /**
   * Abort signal for cancellation
   */
  signal?: AbortSignal;

  /**
   * Whether to automatically rollback invalid files
   */
  autoRollback?: boolean;

  /**
   * FIX 6: Streaming callback - called after each file is validated
   * Allows incremental result persistence to avoid memory bloat
   */
  onFileComplete?: (file: ValidatedFile, index: number, total: number) => void | Promise<void>;
}

/**
 * Validator class for integrity verification
 */
export class Validator {
  private pool: WorkerPool | null = null;

  /**
   * Initialize the worker pool
   */
  async initialize(): Promise<void> {
    if (!this.pool) {
      this.pool = await getWorkerPool();
    }
  }

  /**
   * Validate all copied files by re-hashing and comparing
   */
  async validate(files: CopiedFile[], options?: ValidatorOptions): Promise<ValidationResult> {
    await this.initialize();

    const startTime = Date.now();

    // Filter files that were actually copied
    const filesToValidate = files.filter(f => f.archivePath !== null && !f.copyError);

    const totalFiles = filesToValidate.length;
    let validatedCount = 0;
    let validCount = 0;
    let invalidCount = 0;
    let rolledBackCount = 0;

    const results: ValidatedFile[] = [];

    // Validate files in parallel batches
    const batchSize = 50;

    for (let i = 0; i < filesToValidate.length; i += batchSize) {
      if (options?.signal?.aborted) {
        throw new Error('Validation cancelled');
      }

      const batch = filesToValidate.slice(i, i + batchSize);
      const batchPaths = batch.map(f => f.archivePath!);

      // Hash the batch
      const hashResults = await this.pool!.hashBatch(batchPaths);

      // Compare hashes
      for (let j = 0; j < batch.length; j++) {
        const file = batch[j];
        const hashResult = hashResults[j];

        const validatedFile: ValidatedFile = {
          ...file,
          isValid: false,
          validationError: null,
        };

        if (hashResult.error) {
          validatedFile.validationError = `Re-hash failed: ${hashResult.error}`;
          invalidCount++;

          // Rollback if requested
          if (options?.autoRollback !== false) {
            await this.rollback(file.archivePath!);
            rolledBackCount++;
          }
        } else if (hashResult.hash !== file.hash) {
          validatedFile.validationError = `Hash mismatch: expected ${file.hash}, got ${hashResult.hash}`;
          invalidCount++;

          // Rollback invalid file
          if (options?.autoRollback !== false) {
            await this.rollback(file.archivePath!);
            rolledBackCount++;
          }
        } else {
          validatedFile.isValid = true;
          validCount++;
        }

        results.push(validatedFile);
        validatedCount++;

        // Report progress (80-95% range)
        if (options?.onProgress && totalFiles > 0) {
          const percent = 80 + ((validatedCount / totalFiles) * 15);
          options.onProgress(percent, file.filename);
        }

        // FIX 6: Stream result to caller for incremental persistence
        if (options?.onFileComplete) {
          await options.onFileComplete(validatedFile, validatedCount - 1, totalFiles);
        }
      }
    }

    // Add files that weren't copied (duplicates, errors) to results
    for (const file of files) {
      if (file.archivePath === null || file.copyError) {
        results.push({
          ...file,
          isValid: false,
          validationError: file.copyError || 'Not copied',
        });
      }
    }

    const validationTimeMs = Date.now() - startTime;

    return {
      files: results,
      totalValidated: validatedCount,
      totalValid: validCount,
      totalInvalid: invalidCount,
      totalRolledBack: rolledBackCount,
      validationTimeMs,
    };
  }

  /**
   * Rollback a single file (delete from archive)
   */
  private async rollback(archivePath: string): Promise<void> {
    try {
      await fs.unlink(archivePath);
      console.log(`[Validator] Rolled back invalid file: ${archivePath}`);
    } catch (error) {
      console.warn(`[Validator] Failed to rollback file: ${archivePath}`, error);
    }
  }
}

/**
 * Create a Validator instance
 */
export function createValidator(): Validator {
  return new Validator();
}
