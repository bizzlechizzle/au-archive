/**
 * AddressService - libpostal-powered address parsing and normalization
 *
 * Per kanye9.md: Universal address handling for premium archive experience
 *
 * Features:
 * - Parse raw address strings into components (libpostal or fallback)
 * - Normalize addresses for consistent storage
 * - Store both raw and normalized forms
 * - Format addresses for display
 *
 * libpostal: ML-trained on OpenStreetMap, handles international addresses
 * Fallback: AddressNormalizer regex-based parser for systems without libpostal
 */

import { AddressNormalizer, type ParsedAddress as FallbackParsedAddress } from './address-normalizer';

// Try to load node-postal, gracefully degrade if not available
let postal: any = null;
let libpostalAvailable = false;

try {
  postal = require('node-postal');
  // Test that it actually works
  postal.parser.parse_address('test');
  libpostalAvailable = true;
  console.log('[AddressService] libpostal available - using ML-powered parsing');
} catch (err) {
  console.log('[AddressService] libpostal not available - using regex fallback');
}

/**
 * Parsed address components from libpostal
 */
export interface ParsedAddressComponents {
  house_number: string | null;
  road: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  // libpostal-specific fields
  unit: string | null;
  suburb: string | null;
  city_district: string | null;
  state_district: string | null;
}

/**
 * Normalized address for database storage
 */
export interface NormalizedAddress {
  street: string | null;       // "99 Myrtle Avenue"
  city: string | null;         // "Cambridge" (cleaned, no "Village Of")
  county: string | null;       // "Washington"
  state: string | null;        // "NY" (always 2-letter code)
  zipcode: string | null;      // "12816" or "12816-1234"
}

/**
 * Complete address record with raw + normalized + metadata
 * This is what gets stored in the database
 */
export interface AddressRecord {
  // Original input exactly as entered/received
  raw: string;

  // Normalized components for storage and geocoding
  normalized: NormalizedAddress;

  // Parsed components (for debugging/display)
  parsed: ParsedAddressComponents;

  // Metadata
  source: 'libpostal' | 'fallback' | 'nominatim' | 'manual';
  confidence: 'high' | 'medium' | 'low';
  processedAt: string;
}

/**
 * AddressService - Main service for address handling
 */
export class AddressService {
  /**
   * Check if libpostal is available
   */
  static isLibpostalAvailable(): boolean {
    return libpostalAvailable;
  }

  /**
   * Parse a raw address string into components
   *
   * @param raw - Raw address string (e.g., "99 myrtle ave village of cambridge ny 12816")
   * @returns Parsed components
   */
  static parse(raw: string): ParsedAddressComponents {
    if (!raw || typeof raw !== 'string' || raw.trim() === '') {
      return this.emptyParsed();
    }

    if (libpostalAvailable) {
      return this.parseWithLibpostal(raw);
    }

    return this.parseWithFallback(raw);
  }

  /**
   * Normalize parsed address components to standard format
   *
   * @param parsed - Parsed address components
   * @returns Normalized address
   */
  static normalize(parsed: ParsedAddressComponents): NormalizedAddress {
    // Build street from house_number + road
    let street: string | null = null;
    if (parsed.house_number && parsed.road) {
      street = `${parsed.house_number} ${parsed.road}`;
    } else if (parsed.road) {
      street = parsed.road;
    } else if (parsed.house_number) {
      street = parsed.house_number;
    }

    // Normalize street (expand abbreviations, proper case)
    if (street) {
      street = AddressNormalizer.normalizeStreet(street);
    }

    // Clean city name - remove "Village Of", "City Of", etc.
    let city = parsed.city;
    if (city) {
      city = this.cleanCityName(city);
      city = AddressNormalizer.normalizeCity(city);
    }

    // Normalize state to 2-letter code
    const state = AddressNormalizer.normalizeStateCode(parsed.state);

    // Normalize zipcode to 5 or 5+4 format
    const zipcode = AddressNormalizer.normalizeZipcode(parsed.postcode);

    return {
      street,
      city,
      county: null, // libpostal doesn't extract county; filled by geocoding
      state,
      zipcode,
    };
  }

  /**
   * Full pipeline: raw string → complete address record
   *
   * @param raw - Raw address string
   * @returns Complete address record with raw + normalized + metadata
   */
  static process(raw: string): AddressRecord {
    const parsed = this.parse(raw);
    const normalized = this.normalize(parsed);

    // Calculate confidence based on completeness
    const fieldCount = [
      normalized.street,
      normalized.city,
      normalized.state,
      normalized.zipcode,
    ].filter(Boolean).length;

    let confidence: 'high' | 'medium' | 'low';
    if (fieldCount >= 3) {
      confidence = 'high';
    } else if (fieldCount >= 2) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return {
      raw: raw.trim(),
      normalized,
      parsed,
      source: libpostalAvailable ? 'libpostal' : 'fallback',
      confidence,
      processedAt: new Date().toISOString(),
    };
  }

  /**
   * Process address from structured input (e.g., from Nominatim)
   *
   * @param input - Structured address components
   * @returns Complete address record
   */
  static processStructured(input: {
    street?: string | null;
    houseNumber?: string | null;
    city?: string | null;
    county?: string | null;
    state?: string | null;
    zipcode?: string | null;
  }): AddressRecord {
    // Build raw string from components
    const rawParts = [
      input.houseNumber && input.street ? `${input.houseNumber} ${input.street}` : input.street,
      input.city,
      input.state,
      input.zipcode,
    ].filter(Boolean);
    const raw = rawParts.join(', ');

    // Build parsed components
    const parsed: ParsedAddressComponents = {
      house_number: input.houseNumber || null,
      road: input.street || null,
      city: input.city || null,
      state: input.state || null,
      postcode: input.zipcode || null,
      country: 'US',
      unit: null,
      suburb: null,
      city_district: null,
      state_district: null,
    };

    // Normalize
    const normalized = this.normalize(parsed);

    // Add county if provided (from Nominatim)
    if (input.county) {
      normalized.county = AddressNormalizer.normalizeCounty(input.county);
    }

    // Calculate confidence
    const fieldCount = [
      normalized.street,
      normalized.city,
      normalized.state,
      normalized.zipcode,
    ].filter(Boolean).length;

    let confidence: 'high' | 'medium' | 'low';
    if (fieldCount >= 3) {
      confidence = 'high';
    } else if (fieldCount >= 2) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return {
      raw,
      normalized,
      parsed,
      source: 'nominatim',
      confidence,
      processedAt: new Date().toISOString(),
    };
  }

  /**
   * Format normalized address for display
   *
   * @param normalized - Normalized address
   * @returns Formatted string (e.g., "99 Myrtle Avenue, Cambridge, NY 12816")
   */
  static format(normalized: NormalizedAddress): string {
    const parts: string[] = [];

    if (normalized.street) {
      parts.push(normalized.street);
    }

    if (normalized.city) {
      parts.push(normalized.city);
    }

    if (normalized.state && normalized.zipcode) {
      parts.push(`${normalized.state} ${normalized.zipcode}`);
    } else if (normalized.state) {
      parts.push(normalized.state);
    } else if (normalized.zipcode) {
      parts.push(normalized.zipcode);
    }

    return parts.join(', ');
  }

  /**
   * Format address for geocoding (optimized for Nominatim)
   *
   * @param normalized - Normalized address
   * @returns String optimized for geocoding API
   */
  static formatForGeocoding(normalized: NormalizedAddress): string {
    // Nominatim works best with: "street, city, state zipcode"
    const parts: string[] = [];

    if (normalized.street) {
      parts.push(normalized.street);
    }

    if (normalized.city) {
      parts.push(normalized.city);
    }

    // Combine state and zip for better Nominatim results
    const stateZip = [normalized.state, normalized.zipcode].filter(Boolean).join(' ');
    if (stateZip) {
      parts.push(stateZip);
    }

    return parts.join(', ');
  }

  /**
   * Clean city name - remove administrative prefixes
   * "Village Of Cambridge" → "Cambridge"
   * "City Of Albany" → "Albany"
   */
  static cleanCityName(city: string): string {
    if (!city) return city;

    return city
      .replace(/^(Village Of|City Of|Town Of|Borough Of|Township Of|Hamlet Of|CDP Of|Municipality Of)\s+/i, '')
      .trim();
  }

  /**
   * Get display-ready city name (cleaned)
   * Use this in frontend components
   */
  static getDisplayCity(city: string | null | undefined): string {
    if (!city) return '';
    return this.cleanCityName(city);
  }

  // ─────────────────────────────────────────────────────────────────
  // Private methods
  // ─────────────────────────────────────────────────────────────────

  /**
   * Parse with libpostal (ML-powered)
   */
  private static parseWithLibpostal(raw: string): ParsedAddressComponents {
    try {
      const result = postal.parser.parse_address(raw);

      // libpostal returns array of { component, label } objects
      const components: Record<string, string> = {};
      for (const item of result) {
        components[item.label] = item.value;
      }

      return {
        house_number: components['house_number'] || null,
        road: components['road'] || null,
        city: components['city'] || null,
        state: components['state'] || null,
        postcode: components['postcode'] || null,
        country: components['country'] || 'US',
        unit: components['unit'] || null,
        suburb: components['suburb'] || null,
        city_district: components['city_district'] || null,
        state_district: components['state_district'] || null,
      };
    } catch (err) {
      console.error('[AddressService] libpostal parse error:', err);
      return this.parseWithFallback(raw);
    }
  }

  /**
   * Parse with fallback regex (AddressNormalizer)
   */
  private static parseWithFallback(raw: string): ParsedAddressComponents {
    const fallback = AddressNormalizer.parseFullAddress(raw);

    return {
      house_number: fallback.house_number,
      road: fallback.street,
      city: fallback.city,
      state: fallback.state,
      postcode: fallback.zipcode,
      country: fallback.country || 'US',
      unit: null,
      suburb: null,
      city_district: null,
      state_district: null,
    };
  }

  /**
   * Return empty parsed components
   */
  private static emptyParsed(): ParsedAddressComponents {
    return {
      house_number: null,
      road: null,
      city: null,
      state: null,
      postcode: null,
      country: null,
      unit: null,
      suburb: null,
      city_district: null,
      state_district: null,
    };
  }
}

// Export singleton check for convenience
export const isLibpostalAvailable = AddressService.isLibpostalAvailable;
