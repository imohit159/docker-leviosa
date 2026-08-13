import { z } from 'zod';
import {
  BrowseDefaults,
  GrowthDefaults,
  PaginationDefaults,
  SortDirection,
  VolumeListDefaults,
  VolumeSortKey,
  VolumeUsage,
} from '@leviosa/shared';
import { Schema } from '../utils/index.utils.js';

/**
 * Docker's own constraint on volume names. Enforced here so a malformed name is
 * rejected at the edge rather than travelling into a path or a container argument.
 */
const VOLUME_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
const VOLUME_NAME_MAX = 255;
const SEARCH_MAX = 128;

const volumeNameSchema = z
  .string()
  .trim()
  .min(1, 'Volume name is required.')
  .max(VOLUME_NAME_MAX, `Volume names cannot exceed ${String(VOLUME_NAME_MAX)} characters.`)
  .regex(VOLUME_NAME_PATTERN, 'Volume names may contain letters, digits, dot, dash and underscore only.');

const listQuerySchema = z.object({
  search: z.string().trim().max(SEARCH_MAX).optional(),
  usage: z.enum([VolumeUsage.IN_USE, VolumeUsage.RESERVED, VolumeUsage.ORPHANED]).optional(),
  project: z.string().trim().max(SEARCH_MAX).optional(),
  sort: z
    .enum([VolumeSortKey.NAME, VolumeSortKey.SIZE, VolumeSortKey.CREATED_AT, VolumeSortKey.LAST_WRITE_AT])
    .default(VolumeListDefaults.SORT),
  order: z.enum([SortDirection.ASC, SortDirection.DESC]).default(VolumeListDefaults.ORDER),
  limit: z.coerce
    .number()
    .int()
    .min(PaginationDefaults.MIN_LIMIT)
    .max(PaginationDefaults.MAX_LIMIT)
    .default(PaginationDefaults.LIMIT),
  offset: z.coerce.number().int().min(0).default(PaginationDefaults.OFFSET),
});

const browseQuerySchema = z.object({
  path: z.string().max(BrowseDefaults.MAX_PATH_LENGTH).default(BrowseDefaults.ROOT_PATH),
});

const growthQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .min(GrowthDefaults.MIN_DAYS)
    .max(GrowthDefaults.MAX_DAYS)
    .default(GrowthDefaults.DAYS),
});

const deleteQuerySchema = z.object({
  confirm: z.string().min(1, 'Echo the volume name in "confirm" to authorise deletion.'),
});

const jobIdSchema = z.string().uuid('Job ids are UUIDs issued by this API.');

export type NormalizedVolumeListQuery = z.output<typeof listQuerySchema>;
export type NormalizedBrowseQuery = z.output<typeof browseQuerySchema>;
export type NormalizedGrowthQuery = z.output<typeof growthQuerySchema>;
export type NormalizedDeleteQuery = z.output<typeof deleteQuerySchema>;

export const VolumeValidation = Object.freeze({
  volumeName(value: unknown): string {
    return Schema.parse(volumeNameSchema, value, 'volume name');
  },

  listQuery(value: unknown): NormalizedVolumeListQuery {
    return Schema.parse(listQuerySchema, value, 'volume list query');
  },

  browseQuery(value: unknown): NormalizedBrowseQuery {
    return Schema.parse(browseQuerySchema, value, 'directory listing query');
  },

  growthQuery(value: unknown): NormalizedGrowthQuery {
    return Schema.parse(growthQuerySchema, value, 'growth query');
  },

  deleteQuery(value: unknown): NormalizedDeleteQuery {
    return Schema.parse(deleteQuerySchema, value, 'delete confirmation');
  },

  jobId(value: unknown): string {
    return Schema.parse(jobIdSchema, value, 'job id');
  },
});
