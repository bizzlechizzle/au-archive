/**
 * Unit tests for Media domain model
 */

import { describe, it, expect } from 'vitest';
import {
  MediaTypeSchema,
  FILE_EXTENSIONS,
  getMediaType,
} from '../../src/domain/media.js';

describe('Media Domain Model', () => {
  describe('MediaTypeSchema', () => {
    it('should validate all media types', () => {
      const types = ['image', 'video', 'document', 'map'];

      for (const type of types) {
        const result = MediaTypeSchema.safeParse(type);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid types', () => {
      const result = MediaTypeSchema.safeParse('audio');
      expect(result.success).toBe(false);
    });
  });

  describe('FILE_EXTENSIONS', () => {
    it('should have extensions for all media types', () => {
      expect(FILE_EXTENSIONS.image.length).toBeGreaterThan(20);
      expect(FILE_EXTENSIONS.video.length).toBeGreaterThan(10);
      expect(FILE_EXTENSIONS.document.length).toBeGreaterThan(5);
      expect(FILE_EXTENSIONS.map.length).toBeGreaterThan(5);
    });

    it('should include common image formats', () => {
      const imageExts = FILE_EXTENSIONS.image;
      expect(imageExts).toContain('.jpg');
      expect(imageExts).toContain('.jpeg');
      expect(imageExts).toContain('.png');
      expect(imageExts).toContain('.gif');
      expect(imageExts).toContain('.webp');
    });

    it('should include RAW camera formats', () => {
      const imageExts = FILE_EXTENSIONS.image;
      expect(imageExts).toContain('.nef'); // Nikon
      expect(imageExts).toContain('.cr2'); // Canon
      expect(imageExts).toContain('.arw'); // Sony
      expect(imageExts).toContain('.dng'); // Adobe
      expect(imageExts).toContain('.orf'); // Olympus
    });

    it('should include common video formats', () => {
      const videoExts = FILE_EXTENSIONS.video;
      expect(videoExts).toContain('.mp4');
      expect(videoExts).toContain('.mov');
      expect(videoExts).toContain('.avi');
      expect(videoExts).toContain('.mkv');
      expect(videoExts).toContain('.webm');
    });

    it('should include common document formats', () => {
      const docExts = FILE_EXTENSIONS.document;
      expect(docExts).toContain('.pdf');
      expect(docExts).toContain('.doc');
      expect(docExts).toContain('.docx');
      expect(docExts).toContain('.txt');
    });

    it('should include map formats', () => {
      const mapExts = FILE_EXTENSIONS.map;
      expect(mapExts).toContain('.gpx');
      expect(mapExts).toContain('.kml');
      expect(mapExts).toContain('.kmz');
      expect(mapExts).toContain('.geojson');
    });
  });

  describe('getMediaType', () => {
    it('should classify image extensions', () => {
      expect(getMediaType('.jpg')).toBe('image');
      expect(getMediaType('.jpeg')).toBe('image');
      expect(getMediaType('.png')).toBe('image');
      expect(getMediaType('.nef')).toBe('image');
      expect(getMediaType('.cr2')).toBe('image');
    });

    it('should classify video extensions', () => {
      expect(getMediaType('.mp4')).toBe('video');
      expect(getMediaType('.mov')).toBe('video');
      expect(getMediaType('.mkv')).toBe('video');
      expect(getMediaType('.avi')).toBe('video');
    });

    it('should classify document extensions', () => {
      expect(getMediaType('.pdf')).toBe('document');
      expect(getMediaType('.doc')).toBe('document');
      expect(getMediaType('.docx')).toBe('document');
      expect(getMediaType('.txt')).toBe('document');
    });

    it('should classify map extensions', () => {
      expect(getMediaType('.gpx')).toBe('map');
      expect(getMediaType('.kml')).toBe('map');
      expect(getMediaType('.geojson')).toBe('map');
    });

    it('should handle extensions without dot', () => {
      expect(getMediaType('jpg')).toBe('image');
      expect(getMediaType('mp4')).toBe('video');
      expect(getMediaType('pdf')).toBe('document');
    });

    it('should be case insensitive', () => {
      expect(getMediaType('.JPG')).toBe('image');
      expect(getMediaType('.MP4')).toBe('video');
      expect(getMediaType('.PDF')).toBe('document');
    });

    it('should default to document for unknown extensions', () => {
      expect(getMediaType('.xyz')).toBe('document');
      expect(getMediaType('.unknown')).toBe('document');
    });
  });
});
