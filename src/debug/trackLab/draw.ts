import type { TrackConfig } from '../../config';
import type { Vec2 } from '../../core/vec2';
import type { CenterLine, Violation } from '../../gen/types';
import { screenToWorld, worldToScreen, type View } from './view';

/** What the lab draws for one seed. */
export interface LabScene {
  controlPoints: readonly Vec2[];
  line: CenterLine;
  violations: readonly Violation[];
}

const COLORS = {
  background: '#12161b',
  grid: '#1c232b',
  gridMajor: '#28323d',
  bounds: '#4b5a6a',
  roadEdge: '#0b0e11',
  road: '#4a535e',
  centerLine: '#e9eef3',
  controlPoint: '#f2b441',
  start: '#ffffff',
  label: '#9aa7b4',
  bad: '#ff7a70',
};

/** Draws the whole lab view. The context is expected to be scaled so one unit is one CSS pixel. */
export function drawLab(ctx: CanvasRenderingContext2D, view: View, scene: LabScene | null, cfg: TrackConfig): void {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, view.width, view.height);

  drawGrid(ctx, view);
  drawBounds(ctx, view, cfg.buildableRadius);
  if (scene) {
    drawRoad(ctx, view, scene.line, cfg.roadWidth);
    drawControlPoints(ctx, view, scene.controlPoints);
    drawStart(ctx, view, scene.line, cfg.roadWidth);
    drawViolations(ctx, view, scene.violations);
  }
  drawScaleBar(ctx, view);
}

function drawGrid(ctx: CanvasRenderingContext2D, view: View): void {
  const step = view.scale * 100 >= 24 ? 100 : 500;
  const topLeft = screenToWorld(view, 0, 0);
  const bottomRight = screenToWorld(view, view.width, view.height);

  ctx.lineWidth = 1;
  for (let x = Math.ceil(topLeft.x / step) * step; x <= bottomRight.x; x += step) {
    const { sx } = worldToScreen(view, x, 0);
    ctx.strokeStyle = x % 500 === 0 ? COLORS.gridMajor : COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(Math.round(sx) + 0.5, 0);
    ctx.lineTo(Math.round(sx) + 0.5, view.height);
    ctx.stroke();
  }
  for (let z = Math.ceil(topLeft.z / step) * step; z <= bottomRight.z; z += step) {
    const { sy } = worldToScreen(view, 0, z);
    ctx.strokeStyle = z % 500 === 0 ? COLORS.gridMajor : COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(sy) + 0.5);
    ctx.lineTo(view.width, Math.round(sy) + 0.5);
    ctx.stroke();
  }
}

function drawBounds(ctx: CanvasRenderingContext2D, view: View, radius: number): void {
  const { sx, sy } = worldToScreen(view, 0, 0);
  ctx.strokeStyle = COLORS.bounds;
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.arc(sx, sy, radius * view.scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function tracePath(ctx: CanvasRenderingContext2D, view: View, line: CenterLine): void {
  ctx.beginPath();
  for (let i = 0; i < line.count; i++) {
    const { sx, sy } = worldToScreen(view, line.x[i]!, line.z[i]!);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.closePath();
}

function drawRoad(ctx: CanvasRenderingContext2D, view: View, line: CenterLine, roadWidth: number): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  tracePath(ctx, view, line);
  ctx.strokeStyle = COLORS.roadEdge;
  ctx.lineWidth = (roadWidth + 2) * view.scale + 2;
  ctx.stroke();

  ctx.strokeStyle = COLORS.road;
  ctx.lineWidth = Math.max(1.5, roadWidth * view.scale);
  ctx.stroke();

  ctx.strokeStyle = COLORS.centerLine;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.55;
  ctx.setLineDash([5, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function drawControlPoints(ctx: CanvasRenderingContext2D, view: View, points: readonly Vec2[]): void {
  ctx.fillStyle = COLORS.controlPoint;
  for (const point of points) {
    const { sx, sy } = worldToScreen(view, point.x, point.z);
    ctx.beginPath();
    ctx.arc(sx, sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A line across the road at the first sample, with an arrow showing the direction of travel. */
function drawStart(ctx: CanvasRenderingContext2D, view: View, line: CenterLine, roadWidth: number): void {
  const x = line.x[0]!, z = line.z[0]!;
  const tx = line.tx[0]!, tz = line.tz[0]!;
  const half = roadWidth / 2 + 3;
  const left = worldToScreen(view, x + tz * half, z - tx * half);
  const right = worldToScreen(view, x - tz * half, z + tx * half);

  ctx.strokeStyle = COLORS.start;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(left.sx, left.sy);
  ctx.lineTo(right.sx, right.sy);
  ctx.stroke();

  const base = worldToScreen(view, x, z);
  const tip = { sx: base.sx + tx * 26, sy: base.sy + tz * 26 };
  ctx.fillStyle = COLORS.start;
  ctx.beginPath();
  ctx.moveTo(tip.sx, tip.sy);
  ctx.lineTo(base.sx + tx * 10 - tz * 7, base.sy + tz * 10 + tx * 7);
  ctx.lineTo(base.sx + tx * 10 + tz * 7, base.sy + tz * 10 - tx * 7);
  ctx.closePath();
  ctx.fill();
}

function drawScaleBar(ctx: CanvasRenderingContext2D, view: View): void {
  const lengths = [10, 20, 50, 100, 200, 500, 1000];
  const metres = lengths.find((m) => m * view.scale >= 80) ?? 1000;
  const width = metres * view.scale;
  const x = 20;
  const y = view.height - 24;

  ctx.strokeStyle = COLORS.label;
  ctx.fillStyle = COLORS.label;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.lineTo(x + width, y - 5);
  ctx.stroke();
  ctx.font = '12px ui-monospace, "Cascadia Mono", Consolas, monospace';
  ctx.textBaseline = 'bottom';
  ctx.fillText(metres >= 1000 ? `${metres / 1000} km` : `${metres} m`, x + 6, y - 6);
}

/** A red ring where each rule was broken. Lap-length problems have no place, so they are skipped. */
function drawViolations(ctx: CanvasRenderingContext2D, view: View, violations: readonly Violation[]): void {
  ctx.strokeStyle = COLORS.bad;
  ctx.lineWidth = 2.5;
  for (const violation of violations) {
    if (violation.kind === 'lap-too-short' || violation.kind === 'lap-too-long') continue;
    const { sx, sy } = worldToScreen(view, violation.x, violation.z);
    ctx.beginPath();
    ctx.arc(sx, sy, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx - 5, sy - 5);
    ctx.lineTo(sx + 5, sy + 5);
    ctx.moveTo(sx + 5, sy - 5);
    ctx.lineTo(sx - 5, sy + 5);
    ctx.stroke();
  }
}
