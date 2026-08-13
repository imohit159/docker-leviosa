'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { ByteFormat, CountFormat, TimeFormat } from '@leviosa/shared';
import type { VolumeDetail } from '@leviosa/shared';
import { ScanSourceCopy } from '@/lib/constants';
import { useScan, useVolumeDetail } from '@/hooks/index.hooks';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { Composition } from '@/components/detail/composition';
import { ConsumerList } from '@/components/detail/consumer-list';
import { EntryBrowser } from '@/components/detail/entry-browser';
import { GrowthChart } from '@/components/detail/growth-chart';
import { SafetyPanel } from '@/components/detail/safety-panel';
import { UsageBadge } from '@/components/volumes/usage-badge';

/** Key facts pulled straight from the daemon, presented as a definition list. */
function Facts({ volume }: { volume: VolumeDetail }) {
  const size = ByteFormat.split(volume.size?.totalBytes);

  const rows: ReadonlyArray<{ label: string; value: string; mono?: boolean; title?: string }> = [
    { label: 'Size', value: size.unit ? `${size.value} ${size.unit}` : 'never measured' },
    {
      label: 'Contents',
      value: volume.size
        ? `${CountFormat.humanize(volume.size.fileCount)} files · ${CountFormat.humanize(volume.size.directoryCount)} directories`
        : '—',
    },
    { label: 'Created', value: TimeFormat.relative(volume.createdAt), title: TimeFormat.absolute(volume.createdAt) },
    {
      label: 'Last write',
      value: TimeFormat.relative(volume.size?.lastWriteAt),
      title: TimeFormat.absolute(volume.size?.lastWriteAt),
    },
    { label: 'Driver', value: volume.driver, mono: true },
    { label: 'Mountpoint', value: volume.mountpoint, mono: true, title: volume.mountpoint },
  ];

  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-4 text-xs">
          <dt className="shrink-0 text-content-faint">{row.label}</dt>
          <dd
            title={row.title}
            className={`min-w-0 truncate text-right text-content-muted ${row.mono ? 'font-mono' : 'numeric'}`}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function VolumeDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: encodedName } = use(params);
  const name = decodeURIComponent(encodedName);

  const detail = useVolumeDetail(name);
  const scan = useScan(name);

  if (detail.isPending) {
    return <LoadingState label="Loading volume" />;
  }

  if (detail.isError) {
    return (
      <div className="pt-8">
        <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
      </div>
    );
  }

  const volume = detail.data;
  const measuredHint = volume.size
    ? `${ScanSourceCopy[volume.size.source]} · ${TimeFormat.relative(volume.size.measuredAt)}`
    : 'This volume has never been measured.';

  return (
    <div className="flex flex-col gap-5 pt-8">
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-1.5 text-xs text-content-faint transition-colors hover:text-content"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        All volumes
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate font-mono text-lg font-semibold tracking-tight">{volume.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <UsageBadge usage={volume.usage} />
            {volume.composeProject ? (
              <span className="text-xs text-content-faint">
                compose project <span className="font-mono text-content-muted">{volume.composeProject}</span>
              </span>
            ) : null}
          </div>
        </div>

        <Button variant="secondary" loading={scan.isRunning} onClick={scan.start}>
          <RefreshCw className="size-3.5" aria-hidden />
          {scan.isRunning ? 'Measuring' : 'Re-measure'}
        </Button>
      </div>

      {scan.error ? <p className="text-xs text-danger">{scan.error}</p> : null}

      <SafetyPanel volume={volume} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Overview" hint={measuredHint} />
          <CardBody>
            <Facts volume={volume} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Dependencies"
            hint="Containers referencing this volume, running or stopped."
          />
          <CardBody>
            <ConsumerList consumers={volume.usage.consumers} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Largest contents" hint="Top-level entries by recursive size." />
          <CardBody>
            <Composition entries={volume.topEntries} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Growth"
            hint="Recorded by this tool over time; Docker keeps no size history of its own."
          />
          <CardBody>
            <GrowthChart series={volume.growth} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Browse contents" hint="Directory sizes are recursive totals." />
        <CardBody>
          <EntryBrowser volumeName={volume.name} />
        </CardBody>
      </Card>
    </div>
  );
}
