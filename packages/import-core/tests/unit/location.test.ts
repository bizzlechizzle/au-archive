/**
 * Unit tests for Location domain model
 */

import { describe, it, expect } from 'vitest';
import {
  LocationInputSchema,
  GPSSourceSchema,
  LocationStatusSchema,
  LocationConditionSchema,
} from '../../src/domain/location.js';

describe('Location Domain Model', () => {
  describe('GPSSourceSchema', () => {
    it('should validate all GPS sources', () => {
      const sources = ['user_map_click', 'photo_exif', 'geocoded_address', 'manual_entry'];

      for (const source of sources) {
        const result = GPSSourceSchema.safeParse(source);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid sources', () => {
      const result = GPSSourceSchema.safeParse('gps_device');
      expect(result.success).toBe(false);
    });
  });

  describe('LocationStatusSchema', () => {
    it('should validate all statuses', () => {
      const statuses = ['active', 'demolished', 'renovated', 'unknown', 'restricted'];

      for (const status of statuses) {
        const result = LocationStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('LocationConditionSchema', () => {
    it('should validate all conditions', () => {
      const conditions = ['excellent', 'good', 'fair', 'poor', 'dangerous', 'collapsed', 'unknown'];

      for (const condition of conditions) {
        const result = LocationConditionSchema.safeParse(condition);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('LocationInputSchema', () => {
    it('should validate minimal location input', () => {
      const input = {
        locnam: 'Abandoned Hospital',
      };

      const result = LocationInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should validate complete location input', () => {
      const input = {
        locnam: 'Greystone Park Psychiatric Hospital',
        slocnam: 'greystone',
        akanam: 'Greystone',
        type: 'Hospital',
        stype: 'Psychiatric',
        gps_lat: 40.8,
        gps_lng: -74.5,
        gps_accuracy: 10,
        gps_source: 'photo_exif',
        gps_verified_on_map: true,
        address_street: '123 Main St',
        address_city: 'Morris Plains',
        address_county: 'Morris',
        address_state: 'NJ',
        address_zipcode: '07950',
        condition: 'dangerous',
        status: 'demolished',
        historic: true,
      };

      const result = LocationInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should require location name', () => {
      const input = {
        type: 'Hospital',
      };

      const result = LocationInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should validate GPS coordinates range', () => {
      // Valid coordinates
      const validInput = {
        locnam: 'Test',
        gps_lat: 45.0,
        gps_lng: -90.0,
      };
      expect(LocationInputSchema.safeParse(validInput).success).toBe(true);

      // Invalid latitude (out of range)
      const invalidLat = {
        locnam: 'Test',
        gps_lat: 91.0,
        gps_lng: -90.0,
      };
      expect(LocationInputSchema.safeParse(invalidLat).success).toBe(false);

      // Invalid longitude (out of range)
      const invalidLng = {
        locnam: 'Test',
        gps_lat: 45.0,
        gps_lng: -181.0,
      };
      expect(LocationInputSchema.safeParse(invalidLng).success).toBe(false);
    });

    it('should require state to be 2 characters', () => {
      const validState = {
        locnam: 'Test',
        address_state: 'NY',
      };
      expect(LocationInputSchema.safeParse(validState).success).toBe(true);

      const invalidState = {
        locnam: 'Test',
        address_state: 'New York',
      };
      expect(LocationInputSchema.safeParse(invalidState).success).toBe(false);
    });
  });
});
