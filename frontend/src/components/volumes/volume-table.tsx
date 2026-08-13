'use client';

import { CountFormat } from '@leviosa/shared';
import type { PageMeta, VolumeSummary } from '@leviosa/shared';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { VolumeRow } from './volume-row';

const COLUMNS = [
  { key: 'name', label: 'Volume', align: 'left' },
  { key: 'usage', label: 'Status', align: 'left' },
  { key: 'size', label: 'Size', align: 'right' },
  { key: 'consumers', label: 'Used by', align: 'left' },
  { key: 'activity', label: 'Last write', align: 'left' },
  { key: 'safety', label: 'Deletion', align: 'left' },
  { key: 'open', label: '', align: 'right' },
] as const;

function Pager({
  page,
  onOffsetChange,
}: {
  page: PageMeta;
  onOffsetChange: (offset: number) => void;
}) {
  const from = page.total === 0 ? 0 : page.offset + 1;
  const to = Math.min(page.offset + page.limit, page.total);

  return (
    <div className="flex items-center justify-between border-t border-border-subtle px-5 py-3">
      <p className="numeric text-xs text-content-faint">
        {CountFormat.humanize(from)}–{CountFormat.humanize(to)} of {CountFormat.humanize(page.total)}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={page.offset === 0}
          onClick={() => onOffsetChange(Math.max(0, page.offset - page.limit))}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!page.hasMore}
          onClick={() => onOffsetChange(page.offset + page.limit)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export function VolumeTable({
  volumes,
  page,
  onOffsetChange,
}: {
  volumes: VolumeSummary[];
  page: PageMeta;
  onOffsetChange: (offset: number) => void;
}) {
  if (volumes.length === 0) {
    return (
      <EmptyState
        title="No volumes match these filters"
        hint="Clear the filters, or create a volume with `docker volume create`."
      />
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr className="border-b border-border-subtle">
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`px-3 py-2.5 text-[11px] font-medium tracking-wide text-content-faint uppercase first:pl-5 last:pr-5 ${
                    column.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {volumes.map((volume) => (
              <VolumeRow key={volume.name} volume={volume} />
            ))}
          </tbody>
        </table>
      </div>
      {page.total > page.limit ? <Pager page={page} onOffsetChange={onOffsetChange} /> : null}
    </>
  );
}
