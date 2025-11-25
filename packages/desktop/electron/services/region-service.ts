/**
 * RegionService - Auto-populate Census regions, divisions, and state direction
 *
 * Per DECISION-012: Auto-Population of Regions
 *
 * Features:
 * - Census Region lookup from state (4 regions: Northeast, Midwest, South, West)
 * - Census Division lookup from state (9 divisions)
 * - State Direction calculation from GPS vs state center
 * - Cultural Region suggestion from county lookup
 *
 * All calculations are offline-first using embedded data.
 */

import {
  getCensusRegion,
  getCensusDivision,
  getStateDirection,
  getCulturalRegionFromCounty,
  getCulturalRegionsForState,
} from '../../src/lib/census-regions';

/**
 * Region fields for a location
 */
export interface RegionFields {
  censusRegion: string | null;     // Northeast, Midwest, South, West
  censusDivision: string | null;   // New England, Middle Atlantic, etc.
  stateDirection: string | null;   // e.g., "Eastern NY", "Central TX"
  culturalRegion: string | null;   // e.g., "Capital Region", "Hudson Valley"
}

/**
 * Input data for calculating region fields
 */
export interface RegionInput {
  state?: string | null;
  county?: string | null;
  lat?: number | null;
  lng?: number | null;
  existingCulturalRegion?: string | null; // Don't overwrite if already set
}

/**
 * Calculate all region fields from location data
 * Returns region fields that should be auto-populated
 */
export function calculateRegionFields(input: RegionInput): RegionFields {
  const { state, county, lat, lng, existingCulturalRegion } = input;

  // Census Region from state (always recalculate)
  const censusRegion = getCensusRegion(state);

  // Census Division from state (always recalculate)
  const censusDivision = getCensusDivision(state);

  // State Direction from GPS + state (always recalculate)
  const stateDirection = getStateDirection(lat, lng, state);

  // Cultural Region from county lookup (only suggest if not already set)
  let culturalRegion = existingCulturalRegion || null;
  if (!culturalRegion && county && state) {
    culturalRegion = getCulturalRegionFromCounty(state, county);
  }

  return {
    censusRegion,
    censusDivision,
    stateDirection,
    culturalRegion,
  };
}

/**
 * Get cultural region options for a state (for dropdown)
 */
export function getCulturalRegionOptions(state: string | null | undefined): string[] {
  return getCulturalRegionsForState(state);
}

/**
 * Validate that a cultural region is valid for the given state
 */
export function isValidCulturalRegion(
  state: string | null | undefined,
  culturalRegion: string | null | undefined
): boolean {
  if (!culturalRegion) return true; // null is always valid
  const options = getCulturalRegionsForState(state);
  return options.includes(culturalRegion);
}

// Re-export individual functions for direct use
export {
  getCensusRegion,
  getCensusDivision,
  getStateDirection,
  getCulturalRegionFromCounty,
  getCulturalRegionsForState,
};
