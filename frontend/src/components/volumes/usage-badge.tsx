import { CircleSlash, Pause, Play } from 'lucide-react';
import { VolumeUsage } from '@leviosa/shared';
import type { VolumeUsageReport } from '@leviosa/shared';
import { UsageCopy } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';

const TONE_BY_USAGE: Record<VolumeUsage, BadgeTone> = {
  [VolumeUsage.IN_USE]: 'ok',
  [VolumeUsage.RESERVED]: 'warn',
  [VolumeUsage.ORPHANED]: 'danger',
};

const ICON_BY_USAGE = {
  [VolumeUsage.IN_USE]: Play,
  [VolumeUsage.RESERVED]: Pause,
  [VolumeUsage.ORPHANED]: CircleSlash,
} as const;

/**
 * Usage classification with its container count. Orphans are styled as the alarming
 * case, not the neutral one: an orphan is usually either wasted space or data someone
 * forgot they were keeping.
 */
export function UsageBadge({ usage }: { usage: VolumeUsageReport }) {
  const Icon = ICON_BY_USAGE[usage.status];
  const copy = UsageCopy[usage.status];
  const total = usage.consumers.length;

  return (
    <Badge tone={TONE_BY_USAGE[usage.status]} title={copy.description}>
      <Icon className="size-3" aria-hidden />
      {copy.label}
      {total > 0 ? <span className="numeric opacity-70">{total}</span> : null}
    </Badge>
  );
}
