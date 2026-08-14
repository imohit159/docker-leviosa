import { DeleteVerdict, MeasurementFreshness, ScanSource, VolumeUsage } from '@leviosa/shared';

/**
 * Light ships as the default: the product surface is a reading instrument — tables,
 * verdicts, numbers — and the light palette carries that density with less eye
 * strain in daylight. Dark stays first-class via the switch, and `enableSystem`
 * still honours the OS preference.
 */
export const ThemeConfig = Object.freeze({
  DEFAULT: 'light',
} as const);

/** The daemon this process reaches directly. Mirrors the backend's reserved id. */
export const LOCAL_HOST_ID = 'local';

/**
 * Every internal path in one place. `/` is the marketing landing; the product lives
 * under `/hosts/:hostId/volumes`, so "open the dashboard" and "read about the tool" are
 * different URLs that can evolve independently.
 *
 * The host is a path segment rather than a stored preference, so a link to a volume
 * carries the machine it lives on. A remembered "current host" would make the same URL
 * mean different things for two people, which is exactly the wrong property for a tool
 * whose links get pasted into chat next to a delete recommendation.
 */
export const Route = Object.freeze({
  LANDING: '/',
  SETTINGS: '/settings',
  dashboard(hostId: string): string {
    return `/hosts/${encodeURIComponent(hostId)}/volumes`;
  },
  volume(hostId: string, name: string): string {
    return `/hosts/${encodeURIComponent(hostId)}/volumes/${encodeURIComponent(name)}`;
  },
} as const);

/**
 * Motion presets. Centralised for the same reason colours are: a spring tuned in one
 * component and eyeballed in the next is how an interface starts to feel unowned.
 * Durations stay under 300ms — this is an instrument, and lag reads as latency.
 */
export const Motion = Object.freeze({
  /** Layout/position changes: active indicators, reordering rows. */
  SPRING: { type: 'spring', stiffness: 380, damping: 32, mass: 0.7 },
  /** Enter/exit of small chrome. */
  FADE_MS: 0.16,
  /** Per-digit value transitions during polling. */
  DIGIT_MS: 0.28,
  /** Tooltips hold overflow detail, so they open near-instantly rather than on dwell. */
  TOOLTIP_DELAY_MS: 200,
} as const);

/** URL is the source of truth for filter state, so the param names are shared. */
export const SearchParam = Object.freeze({
  USAGE: 'usage',
  SEARCH: 'q',
  SORT: 'sort',
  ORDER: 'order',
  PROJECT: 'project',
  OFFSET: 'offset',
} as const);

/** Keystrokes are cheap, daemon round-trips are not. */
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * Primary navigation. The scopes *are* the workflow — "show me what I can reclaim" is
 * one click, not a filter dropdown — and each one is a real URL so it survives a
 * refresh, a back button and a paste into Slack.
 */
export const VolumeScope = Object.freeze([
  { id: 'all', label: 'All volumes', usage: null, hint: 'Everything on this daemon' },
  {
    id: 'in-use',
    label: 'In use',
    usage: VolumeUsage.IN_USE,
    hint: 'Held open by a running container',
  },
  {
    id: 'reserved',
    label: 'Reserved',
    usage: VolumeUsage.RESERVED,
    hint: 'Claimed by a stopped container',
  },
  {
    id: 'orphaned',
    label: 'Orphans',
    usage: VolumeUsage.ORPHANED,
    hint: 'Nothing references these',
  },
] as const);

export type VolumeScopeId = (typeof VolumeScope)[number]['id'];

/**
 * Tone per usage class, so a component picks a meaning and never a colour.
 *
 * Orphans are brand-toned, not danger-toned. In this product an orphan is the win — the
 * space you are allowed to take back — while `danger` is spent on destructive actions
 * and an unreachable daemon. Reserved gets the warning, because that is the genuinely
 * awkward state: nothing is using the volume, and Docker still will not let it go.
 */
export const UsageTone = Object.freeze({
  [VolumeUsage.IN_USE]: 'ok',
  [VolumeUsage.RESERVED]: 'warn',
  [VolumeUsage.ORPHANED]: 'brand',
} as const);

/** Trailing windows offered by the growth panel. */
export const GROWTH_WINDOWS = Object.freeze([
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
] as const);

/** Skeleton rows rendered while the first inventory page is in flight. */
export const SKELETON_ROW_COUNT = 8;

/** Polling cadences. Deliberately slow: nothing here changes second to second. */
export const PollInterval = Object.freeze({
  /** While a scan job is in flight. */
  ACTIVE_JOB_MS: 1_200,
  /** Volume list and summary refresh. */
  INVENTORY_MS: 15_000,
  /** Daemon reachability indicator. */
  HEALTH_MS: 30_000,
} as const);

export const QueryConfig = Object.freeze({
  STALE_TIME_MS: 5_000,
  RETRY_COUNT: 1,
} as const);

/** Human-facing copy for each usage class, kept out of the components. */
export const UsageCopy = Object.freeze({
  [VolumeUsage.IN_USE]: {
    label: 'In use',
    description: 'Mounted by at least one running container.',
  },
  [VolumeUsage.RESERVED]: {
    label: 'Reserved',
    description: 'Referenced only by stopped containers. Docker will refuse to remove it.',
  },
  [VolumeUsage.ORPHANED]: {
    label: 'Orphan',
    description: 'No container on this daemon references it.',
  },
} as const);

export const FreshnessCopy = Object.freeze({
  [MeasurementFreshness.UNKNOWN]: 'Never measured',
  [MeasurementFreshness.FRESH]: 'Measured recently',
  [MeasurementFreshness.STALE]: 'Measurement is stale',
} as const);

export const VerdictCopy = Object.freeze({
  [DeleteVerdict.SAFE]: 'Safe to delete',
  [DeleteVerdict.BLOCKED_BY_RUNNING_CONTAINER]: 'Cannot delete: running container',
  [DeleteVerdict.BLOCKED_BY_STOPPED_CONTAINER]: 'Cannot delete: stopped container holds it',
  [DeleteVerdict.BLOCKED_BY_SYSTEM_LABEL]: 'Cannot delete: managed volume',
} as const);

export const ScanSourceCopy = Object.freeze({
  [ScanSource.SIDECAR]: 'Measured inside a throwaway container',
  [ScanSource.HOST_FS]: 'Measured directly from the host filesystem',
} as const);

/** Sort options offered by the toolbar, in display order. */
export const SORT_OPTIONS = Object.freeze([
  { value: 'size', label: 'Size' },
  { value: 'name', label: 'Name' },
  { value: 'createdAt', label: 'Created' },
  { value: 'lastWriteAt', label: 'Last write' },
] as const);

/**
 * Value-to-label lookup derived from `SORT_OPTIONS`, so the select trigger can render
 * "Size" while the URL and the API keep the wire value `size`. Derived rather than
 * hand-written: a second literal list is a second thing to forget to update.
 */
export const SORT_LABELS: Record<string, string> = Object.freeze(
  Object.fromEntries(SORT_OPTIONS.map((option) => [option.value, option.label])),
);

/** Bars in the composition breakdown, capped so the chart stays legible. */
export const BREAKDOWN_LIMIT = 8;
