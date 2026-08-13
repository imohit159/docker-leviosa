import type { ErrorCode } from './error-codes.shared.js';

/** Cursor-free offset pagination descriptor returned with every collection. */
export interface PageMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ApiSuccess<TData> {
  success: true;
  data: TData;
  meta?: Record<string, unknown> & { page?: PageMeta };
}

export interface ApiFieldIssue {
  path: string;
  message: string;
}

export interface ApiFailure {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    /** Present for validation failures; one entry per offending field. */
    issues?: ApiFieldIssue[];
    /** Additional machine-readable context, e.g. blocking containers. */
    details?: Record<string, unknown>;
  };
}

export type ApiEnvelope<TData> = ApiSuccess<TData> | ApiFailure;

/** Shape of every collection payload: rows plus their page descriptor. */
export interface Paginated<TRow> {
  items: TRow[];
  page: PageMeta;
}
