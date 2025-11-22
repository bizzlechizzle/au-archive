/**
 * Unit tests for Provenance domain model
 */

import { describe, it, expect } from 'vitest';
import {
  ProvenanceRecordSchema,
  ContributorRoleSchema,
  SourceVolumeSchema,
  createProvenanceRecord,
} from '../../src/domain/provenance.js';

describe('Provenance Domain Model', () => {
  describe('ContributorRoleSchema', () => {
    it('should validate all roles', () => {
      const roles = ['student', 'faculty', 'staff', 'volunteer', 'researcher', 'contractor', 'unknown'];

      for (const role of roles) {
        const result = ContributorRoleSchema.safeParse(role);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid roles', () => {
      const result = ContributorRoleSchema.safeParse('admin');
      expect(result.success).toBe(false);
    });
  });

  describe('SourceVolumeSchema', () => {
    it('should validate all source volumes', () => {
      const volumes = ['sd_card', 'usb_drive', 'internal_storage', 'network_share', 'cloud_storage', 'email_attachment', 'web_download', 'scanner', 'unknown'];

      for (const volume of volumes) {
        const result = SourceVolumeSchema.safeParse(volume);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('createProvenanceRecord', () => {
    it('should create record with required fields', () => {
      const record = createProvenanceRecord(
        'abc123def456',
        'image',
        'testuser',
        'photo.jpg',
        '/Users/test/photo.jpg'
      );

      expect(record.mediaSha).toBe('abc123def456');
      expect(record.mediaType).toBe('image');
      expect(record.importedBy).toBe('testuser');
      expect(record.originalFilename).toBe('photo.jpg');
      expect(record.sourcePath).toBe('/Users/test/photo.jpg');
    });

    it('should set importedAt to current time', () => {
      const before = new Date().toISOString();
      const record = createProvenanceRecord('sha', 'video', 'user', 'file.mp4', '/path');
      const after = new Date().toISOString();

      expect(record.importedAt >= before).toBe(true);
      expect(record.importedAt <= after).toBe(true);
    });

    it('should initialize custody chain with import entry', () => {
      const record = createProvenanceRecord('sha', 'document', 'user', 'doc.pdf', '/path');

      expect(record.custodyChain).toHaveLength(1);
      expect(record.custodyChain![0].action).toBe('imported');
      expect(record.custodyChain![0].actor).toBe('user');
    });

    it('should set optional fields to null', () => {
      const record = createProvenanceRecord('sha', 'map', 'user', 'route.gpx', '/path');

      expect(record.capturedBy).toBeNull();
      expect(record.capturedByRole).toBeNull();
      expect(record.institution).toBeNull();
      expect(record.originalDevice).toBeNull();
      expect(record.capturedAt).toBeNull();
      expect(record.project).toBeNull();
    });
  });

  describe('ProvenanceRecordSchema', () => {
    it('should validate complete record', () => {
      const record = {
        provenanceId: '550e8400-e29b-41d4-a716-446655440000',
        mediaSha: 'a'.repeat(64),
        mediaType: 'image',
        importedBy: 'testuser',
        importedAt: new Date().toISOString(),
        originalFilename: 'test.jpg',
        sourcePath: '/path/to/test.jpg',
        capturedBy: 'photographer',
        capturedByRole: 'student',
        institution: 'Test University',
        originalDevice: 'Nikon D850',
        originalDeviceSerial: 'ABC123',
        capturedAt: new Date().toISOString(),
        captureGpsLat: 42.0,
        captureGpsLng: -74.0,
        project: 'Field Study 2024',
        sourceVolume: 'sd_card',
        custodyChain: [
          { timestamp: new Date().toISOString(), action: 'captured', actor: 'photographer' },
          { timestamp: new Date().toISOString(), action: 'imported', actor: 'testuser' },
        ],
      };

      const result = ProvenanceRecordSchema.safeParse(record);
      expect(result.success).toBe(true);
    });

    it('should require mediaSha to be 64 characters', () => {
      const record = {
        provenanceId: '550e8400-e29b-41d4-a716-446655440000',
        mediaSha: 'tooshort',
        mediaType: 'image',
        importedBy: 'user',
        importedAt: new Date().toISOString(),
        originalFilename: 'test.jpg',
        sourcePath: '/path',
      };

      const result = ProvenanceRecordSchema.safeParse(record);
      expect(result.success).toBe(false);
    });
  });
});
