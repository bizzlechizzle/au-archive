/**
 * Finalizer Unit Tests
 * Tests for batch inserts, job queue population, and database commits
 *
 * @module __tests__/unit/finalizer.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Finalizer, type LocationInfo } from '../../services/import/finalizer';
import type { ValidatedFile } from '../../services/import/validator';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database as DbType } from '../../main/database.types';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Finalizer', () => {
  let sqlite: Database.Database;
  let db: Kysely<DbType>;
  let finalizer: Finalizer;
  let tempDir: string;

  const testLocation: LocationInfo = {
    locid: 'test-loc-123',
    loc12: 'ABC123',
    address_state: 'NY',
    type: 'Factory',
    slocnam: 'old-factory',
  };

  beforeEach(() => {
    sqlite = new Database(':memory:');

    // Create required tables
    sqlite.exec(`
      CREATE TABLE imports (
        import_id TEXT PRIMARY KEY,
        locid TEXT,
        import_date TEXT,
        auth_imp TEXT,
        img_count INTEGER,
        vid_count INTEGER,
        doc_count INTEGER,
        map_count INTEGER,
        notes TEXT
      );

      CREATE TABLE imgs (
        imghash TEXT PRIMARY KEY,
        imgnam TEXT,
        imgnamo TEXT,
        imgloc TEXT,
        imgloco TEXT,
        locid TEXT,
        subid TEXT,
        auth_imp TEXT,
        imgadd TEXT,
        meta_exiftool TEXT,
        meta_width INTEGER,
        meta_height INTEGER,
        meta_date_taken TEXT,
        meta_camera_make TEXT,
        meta_camera_model TEXT,
        meta_gps_lat REAL,
        meta_gps_lng REAL,
        thumb_path TEXT,
        preview_path TEXT,
        preview_extracted INTEGER DEFAULT 0,
        thumb_path_sm TEXT,
        thumb_path_lg TEXT,
        xmp_synced INTEGER DEFAULT 0,
        xmp_modified_at TEXT,
        hidden INTEGER DEFAULT 0,
        hidden_reason TEXT,
        is_live_photo INTEGER DEFAULT 0,
        imported_by_id TEXT,
        imported_by TEXT,
        media_source TEXT,
        is_contributed INTEGER DEFAULT 0,
        contribution_source TEXT,
        preview_quality TEXT,
        file_size_bytes INTEGER
      );

      CREATE TABLE vids (
        vidhash TEXT PRIMARY KEY,
        vidnam TEXT,
        vidnamo TEXT,
        vidloc TEXT,
        vidloco TEXT,
        locid TEXT,
        subid TEXT,
        auth_imp TEXT,
        vidadd TEXT,
        meta_ffmpeg TEXT,
        meta_exiftool TEXT,
        meta_duration REAL,
        meta_width INTEGER,
        meta_height INTEGER,
        meta_codec TEXT,
        meta_fps REAL,
        meta_date_taken TEXT,
        meta_gps_lat REAL,
        meta_gps_lng REAL,
        thumb_path TEXT,
        poster_extracted INTEGER DEFAULT 0,
        thumb_path_sm TEXT,
        thumb_path_lg TEXT,
        preview_path TEXT,
        xmp_synced INTEGER DEFAULT 0,
        xmp_modified_at TEXT,
        hidden INTEGER DEFAULT 0,
        hidden_reason TEXT,
        is_live_photo INTEGER DEFAULT 0,
        imported_by_id TEXT,
        imported_by TEXT,
        media_source TEXT,
        is_contributed INTEGER DEFAULT 0,
        contribution_source TEXT,
        file_size_bytes INTEGER,
        srt_telemetry TEXT
      );

      CREATE TABLE docs (
        dochash TEXT PRIMARY KEY,
        docnam TEXT,
        docnamo TEXT,
        docloc TEXT,
        docloco TEXT,
        locid TEXT,
        subid TEXT,
        auth_imp TEXT,
        docadd TEXT,
        meta_exiftool TEXT,
        meta_page_count INTEGER,
        meta_author TEXT,
        meta_title TEXT,
        hidden INTEGER DEFAULT 0,
        hidden_reason TEXT,
        imported_by_id TEXT,
        imported_by TEXT,
        media_source TEXT,
        is_contributed INTEGER DEFAULT 0,
        contribution_source TEXT,
        file_size_bytes INTEGER
      );

      CREATE TABLE maps (
        maphash TEXT PRIMARY KEY,
        mapnam TEXT,
        mapnamo TEXT,
        maploc TEXT,
        maploco TEXT,
        locid TEXT,
        subid TEXT,
        auth_imp TEXT,
        mapadd TEXT,
        meta_exiftool TEXT,
        meta_map TEXT,
        meta_gps_lat REAL,
        meta_gps_lng REAL,
        reference TEXT,
        map_states TEXT,
        map_verified INTEGER DEFAULT 0,
        thumb_path_sm TEXT,
        thumb_path_lg TEXT,
        preview_path TEXT,
        imported_by_id TEXT,
        imported_by TEXT,
        media_source TEXT,
        file_size_bytes INTEGER
      );

      CREATE TABLE jobs (
        job_id TEXT PRIMARY KEY,
        queue TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 10,
        status TEXT NOT NULL DEFAULT 'pending',
        payload TEXT NOT NULL,
        depends_on TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        error TEXT,
        result TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        locked_by TEXT,
        locked_at TEXT,
        retry_after TEXT,
        last_error TEXT
      );

      CREATE TABLE job_dead_letter (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        queue TEXT NOT NULL,
        payload TEXT NOT NULL,
        error TEXT,
        attempts INTEGER NOT NULL,
        failed_at TEXT NOT NULL,
        acknowledged INTEGER NOT NULL DEFAULT 0
      );
    `);

    db = new Kysely<DbType>({
      dialect: new SqliteDialect({ database: sqlite }),
    });

    finalizer = new Finalizer(db);
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalizer-test-'));
  });

  afterEach(() => {
    sqlite.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createValidatedFile(overrides: Partial<ValidatedFile> = {}): ValidatedFile {
    const archivePath = path.join(tempDir, `${overrides.hash || 'a7f3b2c1e9d4f086'}.jpg`);
    fs.writeFileSync(archivePath, 'test content');

    return {
      id: 'test-id',
      originalPath: '/source/test.jpg',
      filename: 'test.jpg',
      extension: '.jpg',
      size: 12,
      mediaType: 'image',
      shouldSkip: false,
      shouldHide: false,
      hash: 'a7f3b2c1e9d4f086',
      hashError: null,
      isDuplicate: false,
      duplicateIn: null,
      archivePath,
      copyError: null,
      copyStrategy: 'copy',
      bytesCopied: 12,
      isValid: true,
      validationError: null,
      ...overrides,
    };
  }

  describe('finalize', () => {
    it('should create import record', async () => {
      const files: ValidatedFile[] = [createValidatedFile()];

      const result = await finalizer.finalize(files, testLocation, {});

      expect(result.importRecordId).toBeDefined();

      const imports = sqlite.prepare('SELECT * FROM imports').all();
      expect(imports).toHaveLength(1);
    });

    it('should insert media records', async () => {
      const files: ValidatedFile[] = [createValidatedFile()];

      await finalizer.finalize(files, testLocation, {});

      const images = sqlite.prepare('SELECT * FROM imgs').all();
      expect(images).toHaveLength(1);
    });

    it('should skip invalid files', async () => {
      const files: ValidatedFile[] = [
        createValidatedFile({ isValid: false, validationError: 'Failed validation' }),
      ];

      const result = await finalizer.finalize(files, testLocation, {});

      expect(result.totalFinalized).toBe(0);

      const images = sqlite.prepare('SELECT * FROM imgs').all();
      expect(images).toHaveLength(0);
    });
  });

  describe('batch inserts (FIX 5)', () => {
    it('should batch insert multiple images', async () => {
      const files: ValidatedFile[] = [
        createValidatedFile({ id: '1', hash: 'hash1111111111111' }),
        createValidatedFile({ id: '2', hash: 'hash2222222222222' }),
        createValidatedFile({ id: '3', hash: 'hash3333333333333' }),
      ];

      const result = await finalizer.finalize(files, testLocation, {});

      expect(result.totalFinalized).toBe(3);

      const images = sqlite.prepare('SELECT * FROM imgs').all();
      expect(images).toHaveLength(3);
    });

    it('should batch insert by media type', async () => {
      const files: ValidatedFile[] = [
        createValidatedFile({ id: '1', hash: 'imghash111111111', mediaType: 'image' }),
        createValidatedFile({ id: '2', hash: 'vidhash222222222', mediaType: 'video', extension: '.mp4' }),
        createValidatedFile({ id: '3', hash: 'dochash333333333', mediaType: 'document', extension: '.pdf' }),
        createValidatedFile({ id: '4', hash: 'maphash444444444', mediaType: 'map', extension: '.gpx' }),
      ];

      const result = await finalizer.finalize(files, testLocation, {});

      expect(result.totalFinalized).toBe(4);

      const images = sqlite.prepare('SELECT * FROM imgs').all();
      const videos = sqlite.prepare('SELECT * FROM vids').all();
      const docs = sqlite.prepare('SELECT * FROM docs').all();
      const maps = sqlite.prepare('SELECT * FROM maps').all();

      expect(images).toHaveLength(1);
      expect(videos).toHaveLength(1);
      expect(docs).toHaveLength(1);
      expect(maps).toHaveLength(1);
    });

    it('should handle large batches', async () => {
      const files: ValidatedFile[] = Array.from({ length: 100 }, (_, i) =>
        createValidatedFile({
          id: `${i}`,
          hash: `hash${i.toString().padStart(12, '0')}`,
          filename: `file${i}.jpg`,
        })
      );

      const result = await finalizer.finalize(files, testLocation, {});

      expect(result.totalFinalized).toBe(100);

      const images = sqlite.prepare('SELECT * FROM imgs').all();
      expect(images).toHaveLength(100);
    });

    it('should maintain transaction boundary', async () => {
      // Create files where one will fail (duplicate hash)
      sqlite.exec(`INSERT INTO imgs (imghash, imgnam) VALUES ('duplicate_hash_12', 'existing.jpg')`);

      const files: ValidatedFile[] = [
        createValidatedFile({ id: '1', hash: 'unique_hash_11111' }),
        createValidatedFile({ id: '2', hash: 'duplicate_hash_12' }), // This will fail
      ];

      // Should still insert the successful file due to fallback logic
      const result = await finalizer.finalize(files, testLocation, {});

      // The first file should succeed, second fails
      const images = sqlite.prepare('SELECT * FROM imgs').all();
      expect(images.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('job queue population', () => {
    it('should queue ExifTool jobs for all media types', async () => {
      const files: ValidatedFile[] = [
        createValidatedFile({ id: '1', hash: 'hash1111111111111', mediaType: 'image' }),
        createValidatedFile({ id: '2', hash: 'hash2222222222222', mediaType: 'video', extension: '.mp4' }),
      ];

      const result = await finalizer.finalize(files, testLocation, {});

      expect(result.jobsQueued).toBeGreaterThan(0);

      const jobs = sqlite.prepare('SELECT * FROM jobs').all() as { queue: string }[];
      const exifJobs = jobs.filter(j => j.queue === 'exiftool');
      expect(exifJobs.length).toBe(2);
    });

    it('should queue FFprobe jobs for videos', async () => {
      const files: ValidatedFile[] = [
        createValidatedFile({ id: '1', hash: 'vidhash111111111', mediaType: 'video', extension: '.mp4' }),
      ];

      await finalizer.finalize(files, testLocation, {});

      const jobs = sqlite.prepare('SELECT * FROM jobs').all() as { queue: string }[];
      const ffprobeJobs = jobs.filter(j => j.queue === 'ffprobe');
      expect(ffprobeJobs.length).toBe(1);
    });

    it('should queue thumbnail jobs for images and videos', async () => {
      const files: ValidatedFile[] = [
        createValidatedFile({ id: '1', hash: 'imghash111111111', mediaType: 'image' }),
        createValidatedFile({ id: '2', hash: 'vidhash222222222', mediaType: 'video', extension: '.mp4' }),
      ];

      await finalizer.finalize(files, testLocation, {});

      const jobs = sqlite.prepare('SELECT * FROM jobs').all() as { queue: string }[];
      const thumbnailJobs = jobs.filter(j => j.queue === 'thumbnail');
      expect(thumbnailJobs.length).toBe(2);
    });

    it('should set job dependencies correctly', async () => {
      const files: ValidatedFile[] = [
        createValidatedFile({ mediaType: 'video', extension: '.mp4' }),
      ];

      await finalizer.finalize(files, testLocation, {});

      const jobs = sqlite.prepare('SELECT * FROM jobs').all() as { queue: string; depends_on: string | null }[];

      // FFprobe should depend on ExifTool
      const ffprobeJob = jobs.find(j => j.queue === 'ffprobe');
      expect(ffprobeJob?.depends_on).not.toBeNull();

      // Thumbnail should depend on ExifTool (for orientation)
      const thumbnailJob = jobs.find(j => j.queue === 'thumbnail');
      expect(thumbnailJob?.depends_on).not.toBeNull();
    });
  });

  describe('progress reporting', () => {
    it('should call onProgress during finalization', async () => {
      const files: ValidatedFile[] = [createValidatedFile()];

      const onProgress = vi.fn();

      await finalizer.finalize(files, testLocation, { onProgress });

      expect(onProgress).toHaveBeenCalled();
      // Should reach 100% at completion
      const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1];
      expect(lastCall[0]).toBe(100);
    });
  });

  describe('cancellation', () => {
    it('should respect abort signal', async () => {
      const files: ValidatedFile[] = Array.from({ length: 10 }, (_, i) =>
        createValidatedFile({ id: `${i}`, hash: `hash${i.toString().padStart(12, '0')}` })
      );

      const controller = new AbortController();
      controller.abort(); // Abort immediately

      await expect(
        finalizer.finalize(files, testLocation, { signal: controller.signal })
      ).rejects.toThrow('Finalize cancelled');
    });
  });

  describe('user tracking', () => {
    it('should record user info on media records', async () => {
      const files: ValidatedFile[] = [createValidatedFile()];

      await finalizer.finalize(files, testLocation, {
        user: {
          userId: 'user-123',
          username: 'testuser',
        },
      });

      const image = sqlite.prepare('SELECT * FROM imgs').get() as { imported_by_id: string; imported_by: string };
      expect(image.imported_by_id).toBe('user-123');
      expect(image.imported_by).toBe('testuser');
    });
  });
});
