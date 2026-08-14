'use client';

import { useMemo } from 'react';
import { CircleSlash, HardDrive, Layers, PlayCircle } from 'lucide-react';
import { ByteFormat, PaginationDefaults, SortDirection, VolumeSortKey } from '@leviosa/shared';
import type { VolumeListQuery } from '@leviosa/shared';
import { CommandMenu } from '@/components/unlumen-ui/command-menu';
import type { CommandMenuGroupDef } from '@/components/unlumen-ui/command-menu';
import { Route, SearchParam, VolumeScope } from '@/lib/constants';
import { useHostId, useVolumes } from '@/hooks/index.hooks';

const SCOPE_ICON = {
  all: Layers,
  'in-use': PlayCircle,
  reserved: HardDrive,
  orphaned: CircleSlash,
} as const;

/**
 * The palette is sized to the biggest volumes rather than to an alphabetical page,
 * because ⌘K here answers "take me to the one eating the disk", not "take me to the one
 * starting with p". Fuzzy search inside the dialog covers the long tail.
 */
const PALETTE_QUERY: VolumeListQuery = {
  sort: VolumeSortKey.SIZE,
  order: SortDirection.DESC,
  limit: PaginationDefaults.LIMIT,
  offset: PaginationDefaults.OFFSET,
};

export function CommandPalette() {
  // Scoped to the host on screen. A palette spanning every host would need a volume
  // list per host on every keystroke, and would happily offer two identically named
  // volumes with nothing to tell them apart.
  const hostId = useHostId();
  const { data } = useVolumes(hostId, PALETTE_QUERY);

  const groups = useMemo<CommandMenuGroupDef[]>(() => {
    const dashboard = Route.dashboard(hostId);

    const scopeGroup: CommandMenuGroupDef = {
      heading: 'Go to',
      items: VolumeScope.map((scope) => ({
        label: scope.label,
        icon: SCOPE_ICON[scope.id],
        href: scope.usage ? `${dashboard}?${SearchParam.USAGE}=${scope.usage}` : dashboard,
        keywords: [scope.hint],
      })),
    };

    const volumeItems = (data?.items ?? []).map((volume) => ({
      // Size rides along in the label so the palette is a ranked list you can read,
      // not just a jump target.
      label: `${volume.name}  ·  ${ByteFormat.humanize(volume.size?.totalBytes ?? null)}`,
      href: Route.volume(volume.hostId, volume.name),
      keywords: [
        volume.name,
        volume.composeProject ?? '',
        volume.usage.status,
        volume.driver,
      ].filter(Boolean),
    }));

    return volumeItems.length > 0
      ? [scopeGroup, { heading: 'Volumes', items: volumeItems }]
      : [scopeGroup];
  }, [data, hostId]);

  return (
    <CommandMenu
      groups={groups}
      placeholder="Jump to a volume, or type a compose project…"
      triggerProps={{
        label: 'Search volumes',
        className:
          'max-w-xs border-border bg-muted/50 text-muted-foreground hover:bg-accent hover:text-foreground',
      }}
    />
  );
}
