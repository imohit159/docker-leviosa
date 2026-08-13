import type { SortDirection, VolumeSortKey, VolumeUsage } from './enums.shared.js';

/**
 * Filters for `GET /api/v1/volumes`. One collection endpoint serves every view;
 * there are deliberately no per-filter route variants.
 */
export interface VolumeListQuery {
  /** Substring match on volume name, case-insensitive. */
  search?: string;
  /** Restrict to one usage class, e.g. only orphans. */
  usage?: VolumeUsage;
  /** Restrict to a single Docker Compose project label. */
  project?: string;
  sort?: VolumeSortKey;
  order?: SortDirection;
  limit?: number;
  offset?: number;
}

/** Query for `GET /api/v1/volumes/:name/entries`. */
export interface VolumeBrowseQuery {
  /** Volume-relative directory to list. Defaults to the volume root. */
  path?: string;
}

/** Query for `GET /api/v1/volumes/:name/growth`. */
export interface GrowthQuery {
  /** Trailing window in days. */
  days?: number;
}

/** Query for `DELETE /api/v1/volumes/:name`. */
export interface VolumeDeleteQuery {
  /** Must equal the volume name: a typo-proof confirmation token. */
  confirm: string;
}
