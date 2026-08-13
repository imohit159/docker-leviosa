import { CircleSlash, Pause, Play } from 'lucide-react';
import { VolumeUsage } from '@leviosa/shared';
import type { VolumeUsageReport } from '@leviosa/shared';
import { UsageCopy, UsageTone } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';

const ICON_BY_USAGE = {
  [VolumeUsage.IN_USE]: Play,
  [VolumeUsage.RESERVED]: Pause,
  [VolumeUsage.ORPHANED]: CircleSlash,
} as const;

/**
 * Usage classification with its container count. The tone comes from the shared map in
 * constants rather than a local one, so the sidebar, the badge and the detail header
 * cannot drift into disagreeing about what an orphan looks like.
 */
export function UsageBadge({ usage }: { usage: VolumeUsageReport }) {
  const Icon = ICON_BY_USAGE[usage.status];
  const copy = UsageCopy[usage.status];
  const total = usage.consumers.length;

  return (
    <Badge tone={UsageTone[usage.status]} title={copy.description}>
      <Icon className="size-3" aria-hidden />
      {copy.label}
      {total > 0 ? <span className="numeric opacity-70">{total}</span> : null}
    </Badge>
  );
}
