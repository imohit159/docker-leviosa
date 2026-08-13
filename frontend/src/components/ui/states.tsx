'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiRequestError } from '@/lib/api.client';
import { Button } from './button';

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-content-faint">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span>{label}…</span>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="px-5 py-14 text-center">
      <p className="text-sm font-medium text-content-muted">{title}</p>
      {hint ? <p className="mx-auto mt-2 max-w-md text-xs text-content-faint">{hint}</p> : null}
    </div>
  );
}

/**
 * Failure presentation.
 *
 * The API's own message is shown verbatim rather than replaced with something generic:
 * these messages are written to be actionable ("stop this container first", "raise this
 * timeout"), and flattening them into "Something went wrong" throws away the only useful
 * part of the response.
 */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const isApiError = error instanceof ApiRequestError;
  const message = isApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : 'An unknown error occurred.';

  return (
    <div className="px-5 py-10">
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 text-center">
        <AlertTriangle className="size-5 text-danger" aria-hidden />
        <p className="text-sm text-content">{message}</p>
        {isApiError ? (
          <code className="rounded bg-surface-raised px-2 py-0.5 font-mono text-[11px] text-content-faint">
            {error.code}
          </code>
        ) : null}
        {onRetry ? (
          <Button size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}
