import { ErrorCode } from '@leviosa/shared';
import type { ApiEnvelope, ApiFieldIssue } from '@leviosa/shared';
import { ClientConfig } from './config';

/**
 * Transport failure carrying the API's machine-readable code, so callers branch on
 * `code` rather than on message text.
 */
export class ApiRequestError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly issues?: ApiFieldIssue[];
  readonly details?: Record<string, unknown>;

  constructor(params: {
    code: ErrorCode;
    message: string;
    status: number;
    issues?: ApiFieldIssue[];
    details?: Record<string, unknown>;
  }) {
    super(params.message);
    this.name = 'ApiRequestError';
    this.code = params.code;
    this.status = params.status;
    this.issues = params.issues;
    this.details = params.details;
  }

  /** True when the API is simply not there — the most common failure in local dev. */
  get isUnreachable(): boolean {
    return this.code === ErrorCode.DOCKER_UNAVAILABLE || this.status === 0;
  }
}

export type QueryValue = string | number | boolean | undefined | null;

/** Serialises defined parameters only, so absent filters do not become `?x=undefined`. */
function _toQueryString(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded.length > 0 ? `?${encoded}` : '';
}

async function _unwrap<TData>(response: Response): Promise<TData> {
  let payload: ApiEnvelope<TData>;
  try {
    payload = (await response.json()) as ApiEnvelope<TData>;
  } catch {
    throw new ApiRequestError({
      code: ErrorCode.INTERNAL_ERROR,
      message: `The API returned a non-JSON response (HTTP ${String(response.status)}).`,
      status: response.status,
    });
  }

  if (!payload.success) {
    throw new ApiRequestError({
      code: payload.error.code,
      message: payload.error.message,
      status: response.status,
      issues: payload.error.issues,
      details: payload.error.details,
    });
  }

  return payload.data;
}

/** Adds a JSON body only when there is one, so a bodyless POST sends no content type. */
function _jsonBody(body: unknown): RequestInit {
  if (body === undefined) {
    return {};
  }
  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * Thin typed wrapper over `fetch`. Every response passes through the shared envelope,
 * so a component never has to check `success` or dig for an error message.
 */
export const ApiClient = Object.freeze({
  async request<TData>(path: string, init?: RequestInit): Promise<TData> {
    let response: Response;
    try {
      response = await fetch(`${ClientConfig.apiBaseUrl}${path}`, {
        cache: 'no-store',
        ...init,
        // Merged rather than spread over: a caller supplying a content type must not
        // silently drop the Accept header every response is unwrapped against.
        headers: { Accept: 'application/json', ...init?.headers },
      });
    } catch (error) {
      // A network-level failure means the API process is down or CORS blocked us.
      throw new ApiRequestError({
        code: ErrorCode.DOCKER_UNAVAILABLE,
        message: `Cannot reach the API at ${ClientConfig.apiBaseUrl}. Is the backend running?`,
        status: 0,
        details: { cause: String(error) },
      });
    }

    return _unwrap<TData>(response);
  },

  get<TData>(path: string, params: Record<string, QueryValue> = {}): Promise<TData> {
    return ApiClient.request<TData>(`${path}${_toQueryString(params)}`);
  },

  post<TData>(
    path: string,
    params: Record<string, QueryValue> = {},
    body?: unknown,
  ): Promise<TData> {
    return ApiClient.request<TData>(`${path}${_toQueryString(params)}`, {
      method: 'POST',
      ..._jsonBody(body),
    });
  },

  patch<TData>(path: string, body: unknown): Promise<TData> {
    return ApiClient.request<TData>(path, { method: 'PATCH', ..._jsonBody(body) });
  },

  delete<TData>(path: string, params: Record<string, QueryValue> = {}): Promise<TData> {
    return ApiClient.request<TData>(`${path}${_toQueryString(params)}`, { method: 'DELETE' });
  },
});
