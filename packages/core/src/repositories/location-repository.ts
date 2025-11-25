import { Location, LocationInput } from '../domain';

export interface LocationFilters {
  state?: string;
  type?: string;
  hasGPS?: boolean;
  documented?: boolean;
  search?: string;
  historic?: boolean;
  favorite?: boolean;
  // DECISION-013: New filters
  project?: boolean;
  county?: string;
  stype?: string;
  access?: string;
}

export interface LocationRepository {
  create(input: LocationInput): Promise<Location>;
  findById(id: string): Promise<Location | null>;
  findAll(filters?: LocationFilters): Promise<Location[]>;
  update(id: string, input: Partial<LocationInput>): Promise<Location>;
  delete(id: string): Promise<void>;
  count(filters?: LocationFilters): Promise<number>;
}
