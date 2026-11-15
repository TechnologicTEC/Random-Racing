import type { RoadProfile } from '../../gen/types';

/** Where things go on the elevation chart, in CSS pixels. */
export interface ChartLayout {
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Horizontal position of a sample (sample `count` is the start line again, at the right edge). */
  x(sample: number): number;
  /** Vertical position of a height in metres. */
  y(height: number): number;
  /** Lowest and highest height shown, in metres. */
  low: number;
  high: number;
}

/** The chart always shows at least this many metres from bottom to top, so a flat road looks flat. */
const MIN_SPAN = 12;

const COLORS = {
  background: '#0e1216',
  axis: '#2a333d',
  ground: '#7d8894',
  road: '#ffffff',
  cut: 'rgba(255, 122, 112, 0.55)',
  fill: 'rgba(90, 176, 255, 0.55)',
  label: '#9aa7b4',
};

export function chartLayout(profile: RoadProfile, width: number, height: number): ChartLayout {
  const count = profile.height.length;
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i < count; i++) {
    low = Math.min(low, profile.height[i]!, profile.ground[i]!);
    high = Math.max(high, profile.height[i]!, profile.ground[i]!);
  }
  if (high - low < MIN_SPAN) {
    const middle = (low + high) / 2;
    low = middle - MIN_SPAN / 2;
    high = middle + MIN_SPAN / 2;
  }

  const left = 30;
  const right = width - 6;
  const top = 8;
  const bottom = height - 8;
  return {
    left,
    right,
    top,
    bottom,
    low,
    high,
    x: (sample) => left + ((right - left) * sample) / count,
    y: (value) => bottom - ((bottom - top) * (value - low)) / (high - low),
  };
}

/**
 * Draws the road's height along the lap, from the start line on the left.
 * White is the road, grey the natural ground. Red shading is a cutting (road
 * below the ground), blue an embankment (road above it).
 */
export function drawElevationChart(ctx: CanvasRenderingContext2D, width: number, height: number, profile: RoadProfile): void {
  const layout = chartLayout(profile, width, height);
  const count = profile.height.length;
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  // Cut and fill: one thin slice per sample between the ground and the road.
  for (let i = 0; i < count; i++) {
    const road = layout.y(profile.height[i]!);
    const ground = layout.y(profile.ground[i]!);
    ctx.fillStyle = road > ground ? COLORS.cut : COLORS.fill;
    ctx.fillRect(layout.x(i), Math.min(road, ground), Math.max(1, layout.x(i + 1) - layout.x(i)), Math.abs(road - ground));
  }

  const trace = (values: Float64Array, colour: string, lineWidth: number): void => {
    ctx.beginPath();
    for (let i = 0; i <= count; i++) {
      const x = layout.x(i);
      const y = layout.y(values[i % count]!);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = colour;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  };
  trace(profile.ground, COLORS.ground, 1);
  trace(profile.height, COLORS.road, 2);

  ctx.strokeStyle = COLORS.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(layout.left - 0.5, layout.top);
  ctx.lineTo(layout.left - 0.5, layout.bottom);
  ctx.stroke();

  ctx.fillStyle = COLORS.label;
  ctx.font = '10px ui-monospace, "Cascadia Mono", Consolas, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(`${Math.round(layout.high)}`, layout.left - 5, layout.top - 2);
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${Math.round(layout.low)}`, layout.left - 5, layout.bottom + 2);
}
