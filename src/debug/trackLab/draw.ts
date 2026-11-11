import type { TrackConfig } from '../../config';
import type { Vec2 } from '../../core/vec2';
import type { Candidate, CenterLine, CornerKind, Section, Violation } from '../../gen/types';
import { screenToWorld, worldToScreen, type View } from './view';

/** What the lab draws for one seed. */
export interface LabScene {
  /** The candidate shown in full. */
  selected: Candidate;
  /** True when the selected candidate is the winner, so its first sample is the start line. */
  isWinner: boolean;
  /** Other candidates drawn faintly underneath (the rejected ones, when that option is on). */
  ghosts: readonly Candidate[];
  /** The island to draw under the track, if any. */
  terrain?: TerrainPicture | null;
}

/** A top-down picture of the island and where it sits in the world. */
export interface TerrainPicture {
  /** One pixel per height sample. */
  image: CanvasImageSource;
  /** World position of the picture's top left pixel centre, and the distance between pixel centres, in metres. */
  origin: number;
  cell: number;
  /** Pixels along each side. */
  size: number;
}

/** Colours shared by the map and the sidebar legend. */
export const SECTION_COLORS: Record<CornerKind | 'straight' | 'longStraight', string> = {
  straight: '#7d8894',
  longStraight: '#5fd08a',
  hairpin: '#ff7a70',
  sweeper: '#5ab0ff',
  chicane: '#c58bff',
  kink: '#b9c2cc',
  corner: '#f2b441',
};

/** Straights at least this long count towards the score, so they are highlighted. */
const LONG_STRAIGHT = 150;

const COLORS = {
  background: '#12161b',
  grid: '#1c232b',
  gridMajor: '#28323d',
  bounds: '#4b5a6a',
  roadEdge: '#0b0e11',
  road: '#4a535e',
  controlPoint: '#ffffff',
  start: '#ffffff',
  label: '#9aa7b4',
  bad: '#ff7a70',
};

const LABEL_FONT = '11px ui-monospace, "Cascadia Mono", Consolas, monospace';

/** Draws the whole lab view. The context is expected to be scaled so one unit is one CSS pixel. */
export function drawLab(ctx: CanvasRenderingContext2D, view: View, scene: LabScene | null, cfg: TrackConfig): void {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, view.width, view.height);

  if (scene?.terrain) drawTerrain(ctx, view, scene.terrain);
  drawGrid(ctx, view);
  drawBounds(ctx, view, cfg.buildableRadius);
  if (scene) {
    drawGhosts(ctx, view, scene.ghosts);
    const { line, sections, controlPoints, violations } = scene.selected;
    drawRoad(ctx, view, line, cfg.roadWidth);
    drawSections(ctx, view, line, sections);
    drawControlPoints(ctx, view, controlPoints);
    if (scene.isWinner) drawStart(ctx, view, line, cfg.roadWidth);
    drawViolations(ctx, view, violations);
  }
  drawScaleBar(ctx, view);
}

/**
 * Draws one track small, with no labels, for the contact sheet. The view
 * should already be sized to the thumbnail.
 */
export function drawThumbnail(
  ctx: CanvasRenderingContext2D,
  view: View,
  candidate: Candidate,
  cfg: TrackConfig,
  terrain: TerrainPicture | null = null,
): void {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, view.width, view.height);
  if (terrain) drawTerrain(ctx, view, terrain);
  drawBounds(ctx, view, cfg.buildableRadius);
  drawRoad(ctx, view, candidate.line, cfg.roadWidth);
  drawSectionLines(ctx, view, candidate.line, candidate.sections, 2);
  drawStart(ctx, view, candidate.line, cfg.roadWidth);
}

/** Stretches the island picture over the part of the map it covers. */
function drawTerrain(ctx: CanvasRenderingContext2D, view: View, terrain: TerrainPicture): void {
  // Each pixel is centred on its sample, so the picture reaches half a cell beyond the first and last samples.
  const first = terrain.origin - terrain.cell / 2;
  const topLeft = worldToScreen(view, first, first);
  const side = terrain.size * terrain.cell * view.scale;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(terrain.image, topLeft.sx, topLeft.sy, side, side);
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

/** Thin red outlines of other candidates, so rejected layouts can be compared with the chosen one. */
function drawGhosts(ctx: CanvasRenderingContext2D, view: View, ghosts: readonly Candidate[]): void {
  if (ghosts.length === 0) return;
  ctx.strokeStyle = COLORS.bad;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.28;
  for (const ghost of ghosts) {
    tracePath(ctx, view, ghost.line);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
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
}

/** Colours the centre line by section. */
function drawSectionLines(
  ctx: CanvasRenderingContext2D,
  view: View,
  line: CenterLine,
  sections: readonly Section[],
  width: number,
): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  ctx.lineWidth = width;
  for (const section of sections) {
    ctx.strokeStyle = sectionColor(section);
    ctx.beginPath();
    for (let k = 0; k <= section.sampleCount; k++) {
      const i = (section.startIndex + k) % line.count;
      const { sx, sy } = worldToScreen(view, line.x[i]!, line.z[i]!);
      if (k === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }
}

/** Coloured centre line plus labels: straight lengths and corner radii. */
function drawSections(ctx: CanvasRenderingContext2D, view: View, line: CenterLine, sections: readonly Section[]): void {
  drawSectionLines(ctx, view, line, sections, 3);

  ctx.font = LABEL_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const section of sections) {
    const isCorner = section.type === 'corner';
    if (isCorner && section.kind === 'kink') continue;
    if (!isCorner && section.length < 60) continue;
    const i = isCorner ? section.apexIndex : (section.startIndex + Math.floor(section.sampleCount / 2)) % line.count;
    // Corner labels go on the outside of the bend, straight labels to the left of travel.
    const side = isCorner && section.direction === 'left' ? 1 : -1;
    const offset = 22 / view.scale + 8;
    const { sx, sy } = worldToScreen(view, line.x[i]! - line.tz[i]! * offset * side, line.z[i]! + line.tx[i]! * offset * side);
    ctx.fillStyle = sectionColor(section);
    ctx.fillText(isCorner ? `R${Math.round(section.minRadius)}` : `${Math.round(section.length)} m`, sx, sy);
  }
  ctx.textAlign = 'start';
}

function sectionColor(section: Section): string {
  if (section.type === 'corner') return SECTION_COLORS[section.kind];
  return section.length >= LONG_STRAIGHT ? SECTION_COLORS.longStraight : SECTION_COLORS.straight;
}

function drawControlPoints(ctx: CanvasRenderingContext2D, view: View, points: readonly Vec2[]): void {
  ctx.strokeStyle = COLORS.controlPoint;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  for (const point of points) {
    const { sx, sy } = worldToScreen(view, point.x, point.z);
    ctx.beginPath();
    ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** A line across the road at the first sample, with an arrow showing the direction of travel. */
function drawStart(ctx: CanvasRenderingContext2D, view: View, line: CenterLine, roadWidth: number): void {
  const x = line.x[0]!, z = line.z[0]!;
  const tx = line.tx[0]!, tz = line.tz[0]!;
  const half = roadWidth / 2 + 3;
  const left = worldToScreen(view, x + tz * half, z - tx * half);
  const right = worldToScreen(view, x - tz * half, z + tx * half);

  ctx.strokeStyle = COLORS.start;
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(left.sx, left.sy);
  ctx.lineTo(right.sx, right.sy);
  ctx.stroke();

  const base = worldToScreen(view, x, z);
  ctx.fillStyle = COLORS.start;
  ctx.beginPath();
  ctx.moveTo(base.sx + tx * 26, base.sy + tz * 26);
  ctx.lineTo(base.sx + tx * 10 - tz * 7, base.sy + tz * 10 + tx * 7);
  ctx.lineTo(base.sx + tx * 10 + tz * 7, base.sy + tz * 10 - tx * 7);
  ctx.closePath();
  ctx.fill();
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

function drawScaleBar(ctx: CanvasRenderingContext2D, view: View): void {
  const lengths = [10, 20, 50, 100, 200, 500, 1000];
  const metres = lengths.find((m) => m * view.scale >= 80) ?? 1000;
  const width = metres * view.scale;
  const x = 20;
  const y = view.height - 24;

  ctx.strokeStyle = COLORS.label;
  ctx.fillStyle = COLORS.label;
  ctx.lineWidth = 2;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.lineTo(x + width, y - 5);
  ctx.stroke();
  ctx.font = LABEL_FONT;
  ctx.textBaseline = 'bottom';
  ctx.fillText(metres >= 1000 ? `${metres / 1000} km` : `${metres} m`, x + 6, y - 6);
}
