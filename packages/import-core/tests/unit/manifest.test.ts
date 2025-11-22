/**
 * Unit tests for Manifest domain model
 */

import { describe, it, expect } from 'vitest';
import {
  ManifestSchema,
  ManifestFileSchema,
  ImportPhaseSchema,
  FileStatusSchema,
  generateImportId,
  createManifest,
  calculateSummary,
  type ManifestFile,
} from '../../src/domain/manifest.js';

describe('Manifest Domain Model', () => {
  describe('generateImportId', () => {
    it('should generate ID with correct format', () => {
      const id = generateImportId();
      expect(id).toMatch(/^imp-\d{8}-[a-f0-9]{8}$/);
    });

    it('should generate unique IDs', () => {
      const id1 = generateImportId();
      const id2 = generateImportId();
      expect(id1).not.toBe(id2);
    });

    it('should include current date', () => {
      const id = generateImportId();
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      expect(id).toContain(today);
    });
  });

  describe('createManifest', () => {
    const mockInput = {
      files: [
        { path: '/test/photo.jpg', name: 'photo.jpg', size: 1024 },
        { path: '/test/video.mp4', name: 'video.mp4', size: 2048 },
      ],
      locationId: 'loc-123',
      location: {
        locid: 'loc-123',
        locnam: 'Test Location',
        slocnam: 'testloc',
        loc12: 'TESTLOC12345',
        address_state: 'NY',
        type: 'Hospital',
        gps_lat: 42.0,
        gps_lng: -74.0,
      },
      options: { deleteOriginals: false },
      authImp: 'testuser',
    };

    it('should create manifest with correct structure', () => {
      const manifest = createManifest(mockInput);

      expect(manifest.importId).toMatch(/^imp-/);
      expect(manifest.version).toBe('1.0');
      expect(manifest.phase).toBe('phase_1_log');
      expect(manifest.files).toHaveLength(2);
      expect(manifest.location.locid).toBe('loc-123');
    });

    it('should initialize files with pending status', () => {
      const manifest = createManifest(mockInput);

      for (const file of manifest.files) {
        expect(file.status).toBe('pending');
        expect(file.sha256).toBeNull();
        expect(file.type).toBeNull();
        expect(file.isDuplicate).toBe(false);
      }
    });

    it('should set default options', () => {
      const manifest = createManifest(mockInput);

      expect(manifest.options.deleteOriginals).toBe(false);
      expect(manifest.options.verifyChecksums).toBe(true);
      expect(manifest.options.useRsync).toBe(true);
    });

    it('should validate with Zod schema', () => {
      const manifest = createManifest(mockInput);
      const result = ManifestSchema.safeParse(manifest);

      expect(result.success).toBe(true);
    });
  });

  describe('calculateSummary', () => {
    it('should count completed files by type', () => {
      const files: ManifestFile[] = [
        { index: 0, originalPath: '/a.jpg', originalName: 'a.jpg', sizeBytes: 100, sha256: 'abc', type: 'image', isDuplicate: false, metadata: null, archivePath: '/arch/a.jpg', archiveName: 'abc.jpg', verified: true, status: 'complete', error: null },
        { index: 1, originalPath: '/b.mp4', originalName: 'b.mp4', sizeBytes: 200, sha256: 'def', type: 'video', isDuplicate: false, metadata: null, archivePath: '/arch/b.mp4', archiveName: 'def.mp4', verified: true, status: 'complete', error: null },
        { index: 2, originalPath: '/c.jpg', originalName: 'c.jpg', sizeBytes: 150, sha256: 'ghi', type: 'image', isDuplicate: true, metadata: null, archivePath: null, archiveName: null, verified: false, status: 'duplicate', error: null },
      ];

      const summary = calculateSummary(files);

      expect(summary.total).toBe(3);
      expect(summary.imported).toBe(2);
      expect(summary.duplicates).toBe(1);
      expect(summary.images).toBe(1);
      expect(summary.videos).toBe(1);
      expect(summary.bytesProcessed).toBe(300);
    });

    it('should count errors', () => {
      const files: ManifestFile[] = [
        { index: 0, originalPath: '/a.jpg', originalName: 'a.jpg', sizeBytes: 100, sha256: 'abc', type: 'image', isDuplicate: false, metadata: null, archivePath: null, archiveName: null, verified: false, status: 'error', error: 'Copy failed' },
      ];

      const summary = calculateSummary(files);

      expect(summary.errors).toBe(1);
      expect(summary.imported).toBe(0);
    });
  });

  describe('ImportPhaseSchema', () => {
    it('should validate all phases', () => {
      const phases = ['pending', 'phase_1_log', 'phase_2_serialize', 'phase_3_copy', 'phase_4_dump', 'complete', 'failed'];

      for (const phase of phases) {
        const result = ImportPhaseSchema.safeParse(phase);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid phases', () => {
      const result = ImportPhaseSchema.safeParse('invalid_phase');
      expect(result.success).toBe(false);
    });
  });

  describe('FileStatusSchema', () => {
    it('should validate all statuses', () => {
      const statuses = ['pending', 'hashing', 'hashed', 'extracting_metadata', 'serialized', 'copying', 'copied', 'verified', 'complete', 'error', 'duplicate', 'skipped'];

      for (const status of statuses) {
        const result = FileStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      }
    });
  });
});
