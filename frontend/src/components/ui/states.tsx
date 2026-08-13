'use client';

import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiRequestError } from '@/lib/api.client';
import { ShimmerSkeleton } from '@/components/unlumen-ui/shimmer-skeleton';
import { SKELETON_ROW_COUNT } from '@/lib/constants';
import { Button } from './button';

/**
 * Loading states are skeletons rather than a centred spinner, and the skeletons match
 * the shape of the thing arriving. A spinner tells you to wait; a skeleton tells you
 * what you are waiting for, and — more usefully here — reserves the exact height so
 * the page does not jump when data lands.
 */
export function TableSkeleton({ rows = SKELETON_ROW_COUNT }: { rows?: number }) {
  return (
    <div className="divide-y divide-border" aria-busy role="status" aria-label="Loading volumes">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            {/* Staggered widths read as a list of names, not a progress bar. */}
            <ShimmerSkeleton
              className="h-3.5"
              style={{ width: `${45 + ((index * 13) % 35)}%` }}
            />
            <ShimmerSkeleton className="h-2.5 w-24 opacity-60" />
          </div>
          <ShimmerSkeleton className="h-5 w-16 shrink-0" rounded="full" />
          <ShimmerSkeleton className="h-3.5 w-14 shrink-0" />
          <ShimmerSkeleton className="hidden h-3.5 w-24 shrink-0 sm:block" />
          <ShimmerSkeleton className="hidden h-5 w-16 shrink-0 lg:block" rounded="full" />
        </div>
      ))}
    </div>
  );
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="px-4 py-10 text-center" role="status" aria-busy>
      <p className="text-sm text-muted-foreground">{label}…</p>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="px-4 py-14 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint ? (
        <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
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
    <div className="px-4 py-10">
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 text-center">
        <span className="grid size-9 place-items-center rounded-full bg-danger-soft text-danger">
          <TriangleAlert className="size-4" aria-hidden />
        </span>
        <p className="text-sm text-foreground">{message}</p>
        {isApiError ? (
          <code className="identifier rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {error.code}
          </code>
        ) : null}
        {onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}
