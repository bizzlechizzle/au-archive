/**
 * Hasher Unit Tests
 * Tests for BLAKE3 hashing, duplicate detection, and streaming callbacks
 *
 * @module __tests__/unit/hasher.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hasher, type HasherOptions, type HashedFile } from '../../services/import/hasher';
import type { ScannedFile } from '../../services/import/scanner';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database as DbType } from '../../main/database.types';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock the worker pool since we're unit testing
vi.mock('../../services/worker-pool', () => ({
  getWorkerPool: vi.fn().mockResolvedValue({
    hashBatch: vi.fn().mockImplementation((paths: string[]) => {
      // Generate mock hashes for each file
      return Promise.resolve(
        paths.map(p => ({
          hash: 'a7f3b2c1e9d4f086', // Mock BLAKE3 hash (16 chars)
          error: null,
        }))
      );
    }),
  }),
}));

describe('Hasher', () => {
  let sqlite: Database.Database;
  let db: Kysely<DbType>;
  let hasher: Hasher;
  let tempDir: string;

  beforeEach(() => {
    // Create in-memory database
    sqlite = new Database(':memory:');

    // Create media tables for duplicate detection
    sqlite.exec(`
      CREATE TABLE imgs (imghash TEXT PRIMARY KEY);
      CREATE TABLE vids (vidhash TEXT PRIMARY KEY);
      CREATE TABLE docs (dochash TEXT PRIMARY KEY);
      CREATE TABLE maps (maphash TEXT PRIMARY KEY);
    `);

    db = new Kysely<DbType>({
      dialect: new SqliteDialect({ database: sqlite }),
    });

    hasher = new Hasher(db);
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hasher-test-'));
  });

  afterEach(() => {
    sqlite.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  function createScannedFile(overrides: Partial<ScannedFile> = {}): ScannedFile {
    const testPath = path.join(tempDir, 'test.jpg');
    fs.writeFileSync(testPath, 'test content');

    return {
      id: 'test-id',
      originalPath: testPath,
      filename: 'test.jpg',
      extension: '.jpg',
      size: 100,
      mediaType: 'image',
      shouldSkip: false,
      shouldHide: false,
      ...overrides,
    };
  }

  describe('hash', () => {
    it('should hash all provided files', async () => {
      const files: ScannedFile[] = [
        createScannedFile({ id: '1', filename: 'file1.jpg' }),
        createScannedFile({ id: '2', filename: 'file2.jpg' }),
      ];

      const result = await hasher.hash(files, {});

      expect(result.totalHashed).toBe(2);
      expect(result.files).toHaveLength(2);
    });

    it('should skip files marked as shouldSkip', async () => {
      const files: ScannedFile[] = [
        createScannedFile({ shouldSkip: false }),
        createScannedFile({ id: '2', filename: 'skip.aae', shouldSkip: true }),
      ];

      const result = await hasher.hash(files, {});

      const skipped = result.files.find(f => f.filename === 'skip.aae');
      expect(skipped?.hash).toBeNull();
      expect(skipped?.hashError).toBe('Skipped');
    });

    it('should detect duplicates from database', async () => {
      // Insert existing hash into database
      sqlite.exec(`INSERT INTO imgs (imghash) VALUES ('a7f3b2c1e9d4f086')`);

      const files: ScannedFile[] = [
        createScannedFile({ mediaType: 'image' }),
      ];

      const result = await hasher.hash(files, {});

      expect(result.totalDuplicates).toBe(1);
      expect(result.files[0].isDuplicate).toBe(true);
      expect(result.files[0].duplicateIn).toBe('imgs');
    });

    it('should detect video duplicates', async () => {
      sqlite.exec(`INSERT INTO vids (vidhash) VALUES ('a7f3b2c1e9d4f086')`);

      const files: ScannedFile[] = [
        createScannedFile({ mediaType: 'video', extension: '.mp4' }),
      ];

      const result = await hasher.hash(files, {});

      expect(result.totalDuplicates).toBe(1);
      expect(result.files[0].duplicateIn).toBe('vids');
    });
  });

  describe('streaming callback (FIX 6)', () => {
    it('should call onFileComplete for each hashed file', async () => {
      const files: ScannedFile[] = [
        createScannedFile({ id: '1', filename: 'file1.jpg' }),
        createScannedFile({ id: '2', filename: 'file2.jpg' }),
        createScannedFile({ id: '3', filename: 'file3.jpg' }),
      ];

      const onFileComplete = vi.fn();

      await hasher.hash(files, { onFileComplete });

      expect(onFileComplete).toHaveBeenCalledTimes(3);
      // Verify call arguments: (file, index, total)
      expect(onFileComplete).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ hash: expect.any(String) }),
        0,
        3
      );
      expect(onFileComplete).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        1,
        3
      );
      expect(onFileComplete).toHaveBeenNthCalledWith(
        3,
        expect.any(Object),
        2,
        3
      );
    });

    it('should await async onFileComplete callback', async () => {
      const files: ScannedFile[] = [
        createScannedFile(),
      ];

      let callbackCompleted = false;
      const onFileComplete = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        callbackCompleted = true;
      });

      await hasher.hash(files, { onFileComplete });

      expect(callbackCompleted).toBe(true);
    });
  });

  describe('progress reporting', () => {
    it('should call onProgress during hashing', async () => {
      const files: ScannedFile[] = [
        createScannedFile({ id: '1' }),
        createScannedFile({ id: '2' }),
      ];

      const onProgress = vi.fn();

      await hasher.hash(files, { onProgress });

      expect(onProgress).toHaveBeenCalled();
      // Progress should be between 5-40% range
      const [percent] = onProgress.mock.calls[0];
      expect(percent).toBeGreaterThanOrEqual(5);
      expect(percent).toBeLessThanOrEqual(40);
    });
  });

  describe('cancellation', () => {
    it('should throw on abort signal', async () => {
      const files: ScannedFile[] = Array.from({ length: 100 }, (_, i) =>
        createScannedFile({ id: `${i}`, filename: `file${i}.jpg` })
      );

      const controller = new AbortController();
      controller.abort(); // Abort immediately

      await expect(
        hasher.hash(files, { signal: controller.signal })
      ).rejects.toThrow('Hashing cancelled');
    });
  });
});
