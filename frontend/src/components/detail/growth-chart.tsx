'use client';

import { ByteFormat, TimeFormat } from '@leviosa/shared';
import type { GrowthSeries } from '@leviosa/shared';
import { EmptyState } from '@/components/ui/states';

/** Chart geometry in user units; the SVG scales to its container. */
const VIEW = Object.freeze({ width: 640, height: 150, padY: 12 });
const MIN_POINTS_FOR_TREND = 2;

interface PlotPoint {
  x: number;
  y: number;
  totalBytes: number;
  capturedAt: string;
}

/**
 * Projects the series into view space.
 *
 * The y-axis is anchored to the series' own min/max rather than to zero, because the
 * interesting signal is a volume creeping up by a few percent — a zero-based axis renders
 * that as a flat line and hides exactly what this chart exists to show.
 */
function _project(series: GrowthSeries): PlotPoint[] {
  const values = series.points.map((point) => point.totalBytes);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min;
  const usableHeight = VIEW.height - VIEW.padY * 2;
  const lastIndex = series.points.length - 1;

  return series.points.map((point, index) => {
    const ratio = span === 0 ? 0.5 : (point.totalBytes - min) / span;
    return {
      x: lastIndex === 0 ? VIEW.width / 2 : (index / lastIndex) * VIEW.width,
      y: VIEW.height - VIEW.padY - ratio * usableHeight,
      totalBytes: point.totalBytes,
      capturedAt: point.capturedAt,
    };
  });
}

function _toPath(points: PlotPoint[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ');
}

export function GrowthChart({ series }: { series: GrowthSeries }) {
  if (series.points.length < MIN_POINTS_FOR_TREND) {
    return (
      <EmptyState
        title="Not enough history yet"
        hint={
          series.points.length === 0
            ? 'Growth is derived from repeated measurements of this volume. Run a scan to record the first data point.'
            : 'One measurement recorded. A second one, from a later scan or the nightly snapshot, will establish a trend.'
        }
      />
    );
  }

  const points = _project(series);
  const areaPath = `${_toPath(points)} L${VIEW.width} ${VIEW.height} L0 ${VIEW.height} Z`;
  const last = points[points.length - 1];
  const isGrowing = (series.windowDeltaBytes ?? 0) > 0;
  const trendColor = isGrowing ? 'var(--color-warn)' : 'var(--color-ok)';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-xs text-content-faint">
          {TimeFormat.day(points[0]?.capturedAt)} → {TimeFormat.day(last?.capturedAt)}
        </p>
        <p className="numeric text-sm font-medium" style={{ color: trendColor }}>
          {ByteFormat.signed(series.windowDeltaBytes)}
          <span className="ml-1.5 text-xs text-content-faint">
            over {series.windowDays} days
          </span>
        </p>
      </div>

      <svg
        viewBox={`0 0 ${String(VIEW.width)} ${String(VIEW.height)}`}
        className="h-36 w-full"
        role="img"
        aria-label={`Size trend: ${ByteFormat.signed(series.windowDeltaBytes)} over ${String(series.windowDays)} days`}
      >
        <defs>
          <linearGradient id="growth-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={trendColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={trendColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={areaPath} fill="url(#growth-fill)" />
        <path
          d={_toPath(points)}
          fill="none"
          stroke={trendColor}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((point) => (
          <circle key={point.capturedAt} cx={point.x} cy={point.y} r="2.5" fill={trendColor}>
            <title>{`${TimeFormat.absolute(point.capturedAt)} — ${ByteFormat.humanize(point.totalBytes)}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
