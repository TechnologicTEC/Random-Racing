import './world.css';
import { dragOrbit, zoomOrbit, type Orbit } from '../camera/orbit';
import { lookAtPoint, lookAtSpot, lookAtTrack } from '../camera/spots';
import { config } from '../config';
import { formatSeedCode, MAX_SEED, parseSeedInput } from '../core/seedCode';
import type { FitReport, WorldResult } from '../gen';
import { sampleField } from '../gen/world/heightfield';
import { createWorldView, type PixelCounts, type ViewStats } from '../render/worldView';
import { genClient } from '../worker/client';

/** What the page offers to automated checks. */
export interface ViewHandle {
  stats(): ViewStats;
  pixelCounts(): PixelCounts;
  orbit(): Orbit;
  /** The fit report of the world being shown, once there is one. */
  report(): FitReport | null;
}

const TEMPLATE = `
  <div class="world">
    <canvas class="world-canvas" data-ref="canvas" data-testid="world-canvas"></canvas>
    <div class="world-card world-title">
      <h1 data-ref="name" data-testid="world-name">Seed Circuit</h1>
      <p data-ref="code" data-testid="world-code"></p>
      <p class="world-hint">Drag to turn, scroll to zoom.</p>
    </div>
    <div class="world-loading" data-ref="loading" role="status">
      <div class="world-card" data-ref="loadingText">Raising a new island…</div>
    </div>
  </div>
`;

/**
 * The 3D view of a seed's world: builds it in the worker, then shows it with a
 * camera that circles the island.
 */
export function mountWorldPage(root: HTMLElement): ViewHandle {
  root.innerHTML = TEMPLATE;
  const ref = <T extends HTMLElement>(name: string): T => {
    const el = root.querySelector<T>(`[data-ref="${name}"]`);
    if (!el) throw new Error(`World page template is missing "${name}"`);
    return el;
  };
  const canvas = ref<HTMLCanvasElement>('canvas');
  const loading = ref('loading');

  const view = createWorldView(canvas, config.render);
  let orbit: Orbit = { targetX: 0, targetY: 8, targetZ: 0, ...config.camera.orbit.start };
  let dirty = true;
  let report: FitReport | null = null;
  // `&look=cut` (or fill, bank, close, water, hairpin, start) opens on a close view of that spot;
  // `&at=122,-250` opens on a close view of that map position.
  const look = new URL(window.location.href).searchParams.get('look') ?? '';
  const at = new URL(window.location.href).searchParams.get('at') ?? '';

  const resize = (): void => {
    view.resize(Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight), window.devicePixelRatio || 1);
    dirty = true;
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  // Only draw when something has changed: the picture is still unless the camera moves.
  const frame = (): void => {
    if (dirty) {
      view.setOrbit(orbit);
      view.render();
      dirty = false;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  let dragging: { id: number; x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging || dragging.id !== event.pointerId) return;
    orbit = dragOrbit(orbit, event.clientX - dragging.x, event.clientY - dragging.y);
    dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
    dirty = true;
  });
  const endDrag = (event: PointerEvent): void => {
    if (dragging?.id === event.pointerId) dragging = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      orbit = zoomOrbit(orbit, event.deltaY, config.camera.orbit.nearest, config.camera.orbit.furthest);
      dirty = true;
    },
    { passive: false },
  );

  /** Points the camera at the middle of the track, far enough back to see the whole island. */
  const frameIsland = (world: WorldResult): void => {
    const { line, profile } = world.track.candidates[world.track.winnerIndex]!;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, height = 0;
    for (let i = 0; i < line.count; i++) {
      minX = Math.min(minX, line.x[i]!);
      maxX = Math.max(maxX, line.x[i]!);
      minZ = Math.min(minZ, line.z[i]!);
      maxZ = Math.max(maxZ, line.z[i]!);
      height += profile.height[i]! / line.count;
    }
    const span = Math.max(maxX - minX, maxZ - minZ);
    orbit = {
      ...orbit,
      targetX: (minX + maxX) / 2,
      targetY: height,
      targetZ: (minZ + maxZ) / 2,
      distance: Math.min(config.camera.orbit.furthest, span * config.camera.orbit.fit),
    };
    dirty = true;
  };

  const show = async (seed: number): Promise<void> => {
    loading.hidden = false;
    document.body.dataset.worldReady = 'false';
    const url = new URL(window.location.href);
    url.searchParams.set('seed', String(seed));
    window.history.replaceState(null, '', url);
    try {
      const { result, ms } = await genClient().world(seed, config);
      view.load(result);
      report = result.report;
      frameIsland(result);
      const winner = result.track.candidates[result.track.winnerIndex]!;
      const groundAt = (x: number, z: number): number => sampleField(result.ground, x, z, 0);
      const point = lookAtPoint(at, groundAt);
      const spot = point ?? lookAtSpot(look, result.report, groundAt) ?? lookAtTrack(look, winner.line, winner.sections, groundAt);
      if (spot) orbit = spot;
      document.body.dataset.worldLook = point ? 'point' : spot ? look : 'island';
      view.setOrbit(orbit);
      view.render();
      dirty = false;
      ref('name').textContent = result.track.name;
      ref('code').textContent = `Seed ${result.seed} · ${formatSeedCode(result.seed, result.generatorVersion)}`;
      document.title = `${result.track.name} · Seed Circuit`;
      document.body.dataset.worldSeed = String(result.seed);
      document.body.dataset.worldMs = ms.toFixed(0);
      loading.hidden = true;
      document.body.dataset.worldReady = 'true';
    } catch (error) {
      ref('loadingText').textContent = error instanceof Error ? error.message : String(error);
    }
  };

  const fromUrl = parseSeedInput(new URL(window.location.href).searchParams.get('seed') ?? '');
  // Picking a random seed is app code, not generation, so Math.random is fine here.
  const seed = fromUrl ? fromUrl.seed : 1 + Math.floor(Math.random() * 99999);
  void show(Math.min(MAX_SEED, Math.max(0, seed)));

  return { stats: () => view.stats(), pixelCounts: () => view.pixelCounts(), orbit: () => orbit, report: () => report };
}
