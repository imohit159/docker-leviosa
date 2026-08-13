'use client';

import { useMemo } from 'react';
import { CircleSlash, HardDrive, Layers, PlayCircle } from 'lucide-react';
import { ByteFormat, PaginationDefaults, SortDirection, VolumeSortKey } from '@leviosa/shared';
import type { VolumeListQuery } from '@leviosa/shared';
import { CommandMenu } from '@/components/unlumen-ui/command-menu';
import type { CommandMenuGroupDef } from '@/components/unlumen-ui/command-menu';
import { SearchParam, VolumeScope } from '@/lib/constants';
import { useVolumes } from '@/hooks/index.hooks';

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
  const { data } = useVolumes(PALETTE_QUERY);

  const groups = useMemo<CommandMenuGroupDef[]>(() => {
    const scopeGroup: CommandMenuGroupDef = {
      heading: 'Go to',
      items: VolumeScope.map((scope) => ({
        label: scope.label,
        icon: SCOPE_ICON[scope.id],
        href: scope.usage ? `/?${SearchParam.USAGE}=${scope.usage}` : '/',
        keywords: [scope.hint],
      })),
    };

    const volumeItems = (data?.items ?? []).map((volume) => ({
      // Size rides along in the label so the palette is a ranked list you can read,
      // not just a jump target.
      label: `${volume.name}  ·  ${ByteFormat.humanize(volume.size?.totalBytes ?? null)}`,
      href: `/volumes/${encodeURIComponent(volume.name)}`,
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
  }, [data]);

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
