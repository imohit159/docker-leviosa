import type { Response } from 'express';
import type { ApiSuccess, PageMeta, Paginated } from '@leviosa/shared';
import { HttpStatus } from '../config/index.config.js';

/**
 * Every successful response leaves the process through here, so the envelope shape
 * is structurally guaranteed to match `ApiSuccess<T>` on the client.
 */
export const ApiResponse = Object.freeze({
  ok<TData>(res: Response, data: TData, meta?: ApiSuccess<TData>['meta']): Response {
    return ApiResponse.send(res, HttpStatus.OK, data, meta);
  },

  created<TData>(res: Response, data: TData): Response {
    return ApiResponse.send(res, HttpStatus.CREATED, data);
  },

  accepted<TData>(res: Response, data: TData): Response {
    return ApiResponse.send(res, HttpStatus.ACCEPTED, data);
  },

  /** Collection response: rows plus their page descriptor, mirrored into `meta`. */
  paginated<TRow>(res: Response, page: Paginated<TRow>): Response {
    return ApiResponse.send(res, HttpStatus.OK, page, { page: page.page });
  },

  send<TData>(res: Response, status: HttpStatus, data: TData, meta?: ApiSuccess<TData>['meta']): Response {
    const body: ApiSuccess<TData> = meta ? { success: true, data, meta } : { success: true, data };
    return res.status(status).json(body);
  },
});

/** Builds the page descriptor from a materialised row set. */
export const Pagination = Object.freeze({
  describe(total: number, limit: number, offset: number): PageMeta {
    return { total, limit, offset, hasMore: offset + limit < total };
  },

  /** Applies the window to an already-sorted in-memory collection. */
  slice<TRow>(rows: readonly TRow[], limit: number, offset: number): Paginated<TRow> {
    return {
      items: rows.slice(offset, offset + limit),
      page: Pagination.describe(rows.length, limit, offset),
    };
  },
});
