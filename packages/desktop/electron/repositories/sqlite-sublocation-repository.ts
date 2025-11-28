import { Kysely } from 'kysely';
import { randomUUID } from 'crypto';
import type { Database, SlocsTable } from '../main/database.types';

/**
 * SubLocation entity for application use
 */
export interface SubLocation {
  subid: string;
  sub12: string;
  locid: string;
  subnam: string;
  ssubname: string | null;
  type: string | null;
  status: string | null;
  hero_imgsha: string | null;
  is_primary: boolean;
  created_date: string;
  created_by: string | null;
  modified_date: string | null;
  modified_by: string | null;
}

/**
 * Input for creating a new sub-location
 */
export interface CreateSubLocationInput {
  locid: string;
  subnam: string;
  ssubname?: string | null;
  type?: string | null;
  status?: string | null;
  is_primary?: boolean;
  created_by?: string | null;
}

/**
 * Input for updating a sub-location
 */
export interface UpdateSubLocationInput {
  subnam?: string;
  ssubname?: string | null;
  type?: string | null;
  status?: string | null;
  hero_imgsha?: string | null;
  is_primary?: boolean;
  modified_by?: string | null;
}

/**
 * Generate short sub-location name (12 chars max)
 */
function generateShortName(name: string): string {
  // Remove common prefixes/suffixes and truncate
  const shortened = name
    .replace(/^(The|A|An)\s+/i, '')
    .replace(/\s+(Building|House|Hall|Center|Centre)$/i, '')
    .substring(0, 12)
    .trim();
  return shortened || name.substring(0, 12);
}

/**
 * SQLite repository for sub-locations
 */
export class SQLiteSubLocationRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Create a new sub-location
   */
  async create(input: CreateSubLocationInput): Promise<SubLocation> {
    const subid = randomUUID();
    const sub12 = subid.substring(0, 12).replace(/-/g, '');
    const ssubname = input.ssubname || generateShortName(input.subnam);
    const created_date = new Date().toISOString();

    await this.db
      .insertInto('slocs')
      .values({
        subid,
        sub12,
        locid: input.locid,
        subnam: input.subnam,
        ssubname,
        type: input.type || null,
        status: input.status || null,
        hero_imgsha: null,
        is_primary: input.is_primary ? 1 : 0,
        created_date,
        created_by: input.created_by || null,
        modified_date: null,
        modified_by: null,
      })
      .execute();

    // If marked as primary, update parent location's sub12 field
    if (input.is_primary) {
      await this.setPrimaryOnParent(input.locid, sub12);
    }

    // Update parent location's sublocs JSON array
    await this.addToParentSublocs(input.locid, subid);

    return {
      subid,
      sub12,
      locid: input.locid,
      subnam: input.subnam,
      ssubname,
      type: input.type || null,
      status: input.status || null,
      hero_imgsha: null,
      is_primary: input.is_primary || false,
      created_date,
      created_by: input.created_by || null,
      modified_date: null,
      modified_by: null,
    };
  }

  /**
   * Find sub-location by ID
   */
  async findById(subid: string): Promise<SubLocation | null> {
    const row = await this.db
      .selectFrom('slocs')
      .selectAll()
      .where('subid', '=', subid)
      .executeTakeFirst();

    return row ? this.mapRowToSubLocation(row) : null;
  }

  /**
   * Find all sub-locations for a parent location
   */
  async findByLocationId(locid: string): Promise<SubLocation[]> {
    const rows = await this.db
      .selectFrom('slocs')
      .selectAll()
      .where('locid', '=', locid)
      .orderBy('is_primary', 'desc')
      .orderBy('subnam', 'asc')
      .execute();

    return rows.map(row => this.mapRowToSubLocation(row));
  }

  /**
   * Update a sub-location
   */
  async update(subid: string, input: UpdateSubLocationInput): Promise<SubLocation | null> {
    const existing = await this.findById(subid);
    if (!existing) return null;

    const modified_date = new Date().toISOString();

    const updateValues: Record<string, unknown> = {
      modified_date,
      modified_by: input.modified_by || null,
    };

    if (input.subnam !== undefined) updateValues.subnam = input.subnam;
    if (input.ssubname !== undefined) updateValues.ssubname = input.ssubname;
    if (input.type !== undefined) updateValues.type = input.type;
    if (input.status !== undefined) updateValues.status = input.status;
    if (input.hero_imgsha !== undefined) updateValues.hero_imgsha = input.hero_imgsha;
    if (input.is_primary !== undefined) updateValues.is_primary = input.is_primary ? 1 : 0;

    await this.db
      .updateTable('slocs')
      .set(updateValues)
      .where('subid', '=', subid)
      .execute();

    // If setting as primary, update parent and clear other primaries
    if (input.is_primary) {
      await this.setPrimary(existing.locid, subid);
    }

    return this.findById(subid);
  }

  /**
   * Delete a sub-location
   */
  async delete(subid: string): Promise<void> {
    const existing = await this.findById(subid);
    if (!existing) return;

    await this.db
      .deleteFrom('slocs')
      .where('subid', '=', subid)
      .execute();

    // Remove from parent location's sublocs array
    await this.removeFromParentSublocs(existing.locid, subid);

    // If this was the primary, clear parent's sub12
    if (existing.is_primary) {
      await this.clearPrimaryOnParent(existing.locid);
    }
  }

  /**
   * Set a sub-location as primary for its parent
   */
  async setPrimary(locid: string, subid: string): Promise<void> {
    // Clear existing primary
    await this.db
      .updateTable('slocs')
      .set({ is_primary: 0 })
      .where('locid', '=', locid)
      .execute();

    // Set new primary
    const subloc = await this.findById(subid);
    if (subloc) {
      await this.db
        .updateTable('slocs')
        .set({ is_primary: 1 })
        .where('subid', '=', subid)
        .execute();

      await this.setPrimaryOnParent(locid, subloc.sub12);
    }
  }

  /**
   * Check if a sub-location name already exists for a location
   */
  async checkNameExists(locid: string, subnam: string, excludeSubid?: string): Promise<boolean> {
    let query = this.db
      .selectFrom('slocs')
      .select('subid')
      .where('locid', '=', locid)
      .where('subnam', '=', subnam);

    if (excludeSubid) {
      query = query.where('subid', '!=', excludeSubid);
    }

    const row = await query.executeTakeFirst();
    return !!row;
  }

  /**
   * Count sub-locations for a parent location
   */
  async countByLocationId(locid: string): Promise<number> {
    const result = await this.db
      .selectFrom('slocs')
      .select(eb => eb.fn.countAll<number>().as('count'))
      .where('locid', '=', locid)
      .executeTakeFirst();

    return result?.count || 0;
  }

  /**
   * Get sub-locations with their hero images for display
   */
  async findWithHeroImages(locid: string): Promise<Array<SubLocation & { hero_thumb_path?: string }>> {
    const sublocs = await this.findByLocationId(locid);

    // For each subloc with a hero_imgsha, fetch the thumbnail path
    const results = await Promise.all(
      sublocs.map(async (subloc) => {
        if (subloc.hero_imgsha) {
          const img = await this.db
            .selectFrom('imgs')
            .select(['thumb_path_lg', 'thumb_path'])
            .where('imgsha', '=', subloc.hero_imgsha)
            .executeTakeFirst();

          return {
            ...subloc,
            hero_thumb_path: img?.thumb_path_lg || img?.thumb_path || undefined,
          };
        }
        return subloc;
      })
    );

    return results;
  }

  // Private helper methods

  private mapRowToSubLocation(row: SlocsTable): SubLocation {
    return {
      subid: row.subid,
      sub12: row.sub12,
      locid: row.locid,
      subnam: row.subnam,
      ssubname: row.ssubname,
      type: row.type || null,
      status: row.status || null,
      hero_imgsha: row.hero_imgsha || null,
      is_primary: row.is_primary === 1,
      created_date: row.created_date || new Date().toISOString(),
      created_by: row.created_by || null,
      modified_date: row.modified_date || null,
      modified_by: row.modified_by || null,
    };
  }

  private async setPrimaryOnParent(locid: string, sub12: string): Promise<void> {
    await this.db
      .updateTable('locs')
      .set({ sub12 })
      .where('locid', '=', locid)
      .execute();
  }

  private async clearPrimaryOnParent(locid: string): Promise<void> {
    await this.db
      .updateTable('locs')
      .set({ sub12: null })
      .where('locid', '=', locid)
      .execute();
  }

  private async addToParentSublocs(locid: string, subid: string): Promise<void> {
    const parent = await this.db
      .selectFrom('locs')
      .select('sublocs')
      .where('locid', '=', locid)
      .executeTakeFirst();

    const currentSublocs: string[] = parent?.sublocs ? JSON.parse(parent.sublocs) : [];
    if (!currentSublocs.includes(subid)) {
      currentSublocs.push(subid);
      await this.db
        .updateTable('locs')
        .set({ sublocs: JSON.stringify(currentSublocs) })
        .where('locid', '=', locid)
        .execute();
    }
  }

  private async removeFromParentSublocs(locid: string, subid: string): Promise<void> {
    const parent = await this.db
      .selectFrom('locs')
      .select('sublocs')
      .where('locid', '=', locid)
      .executeTakeFirst();

    const currentSublocs: string[] = parent?.sublocs ? JSON.parse(parent.sublocs) : [];
    const filteredSublocs = currentSublocs.filter(id => id !== subid);

    await this.db
      .updateTable('locs')
      .set({ sublocs: JSON.stringify(filteredSublocs) })
      .where('locid', '=', locid)
      .execute();
  }
}
