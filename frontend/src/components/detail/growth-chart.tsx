'use client';

import { useId, useRef, useState } from 'react';
import { ByteFormat, TimeFormat } from '@leviosa/shared';
import type { GrowthSeries } from '@leviosa/shared';
import { EmptyState } from '@/components/ui/states';
import { DeltaMetric } from '@/components/ui/metric';

/** Chart geometry in user units; the SVG scales to its container. */
const VIEW = Object.freeze({ width: 640, height: 150, padY: 14 });
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
  const gradientId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

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
  const first = points[0];
  const last = points[points.length - 1];
  const isGrowing = (series.windowDeltaBytes ?? 0) > 0;
  const trendColor = isGrowing ? 'var(--warn)' : 'var(--ok)';
  const active = activeIndex === null ? null : points[activeIndex];

  /**
   * Nearest-point lookup from the pointer's position in view space. Snapping to the
   * closest sample rather than interpolating keeps the readout honest: every value the
   * chart reports is a measurement that actually happened.
   */
  const handleMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    if (bounds.width === 0) return;
    const viewX = ((event.clientX - bounds.left) / bounds.width) * VIEW.width;
    let nearest = 0;
    for (let index = 1; index < points.length; index += 1) {
      const candidate = points[index];
      const current = points[nearest];
      if (candidate && current && Math.abs(candidate.x - viewX) < Math.abs(current.x - viewX)) {
        nearest = index;
      }
    }
    setActiveIndex(nearest);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-4">
        {/* The header swaps to the hovered sample rather than opening a floating tooltip:
            one readout in one fixed place, so your eye never has to chase the cursor. */}
        {active ? (
          <p className="numeric text-xs text-muted-foreground">
            {TimeFormat.absolute(active.capturedAt)}
          </p>
        ) : (
          <p className="numeric text-xs text-muted-foreground">
            {TimeFormat.day(first?.capturedAt)} → {TimeFormat.day(last?.capturedAt)}
          </p>
        )}

        {active ? (
          <p className="numeric text-sm font-medium text-foreground">
            {ByteFormat.humanize(active.totalBytes)}
          </p>
        ) : (
          <p className="text-sm">
            <DeltaMetric bytes={series.windowDeltaBytes} />
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              over {series.windowDays} days
            </span>
          </p>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${String(VIEW.width)} ${String(VIEW.height)}`}
        preserveAspectRatio="none"
        className="h-36 w-full touch-none"
        role="img"
        aria-label={`Size trend: ${ByteFormat.signed(series.windowDeltaBytes)} over ${String(series.windowDays)} days`}
        onPointerMove={handleMove}
        onPointerLeave={() => setActiveIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={trendColor} stopOpacity="0.26" />
            <stop offset="100%" stopColor={trendColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path
          d={_toPath(points)}
          fill="none"
          stroke={trendColor}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {active ? (
          <>
            <line
              x1={active.x}
              y1={0}
              x2={active.x}
              y2={VIEW.height}
              stroke="var(--border)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={active.x}
              cy={active.y}
              r="4"
              fill={trendColor}
              stroke="var(--card)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : null}
      </svg>
    </div>
  );
}
