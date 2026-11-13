import './world.css';
import { createFlyPath, type FlyPath } from '../camera/flyAlong';
import { dragOrbit, orbitEye, zoomOrbit, type Orbit } from '../camera/orbit';
import { lookAtPoint, lookAtRoad, lookAtSpot, lookAtTrack } from '../camera/spots';
import { config } from '../config';
import { formatSeedCode, MAX_SEED, parseSeedInput } from '../core/seedCode';
import type { FitReport, WorldResult } from '../gen';
import { sampleField } from '../gen/world/heightfield';
import { formatClock, parseClock, shortCharacter } from '../debug/trackLab/format';
import { daylightAt } from '../render/daylight';
import { createWorldView, type PixelCounts, type ViewStats } from '../render/worldView';
import { genClient } from '../worker/client';

/** Which camera is in use: flying the lap, or circling a point. */
export type CameraMode = 'fly' | 'orbit';

/** What the page offers to automated checks. */
export interface ViewHandle {
  stats(): ViewStats;
  pixelCounts(): PixelCounts;
  orbit(): Orbit;
  /** The flying camera: how far round the lap it is, and whether it is moving. */
  camera(): { mode: CameraMode; distance: number; lapLength: number; playing: boolean; speed: number };
  /** The fit report of the world being shown, once there is one. */
  report(): FitReport | null;
}

const TEMPLATE = `
  <div class="world">
    <canvas class="world-canvas" data-ref="canvas" data-testid="world-canvas"></canvas>
    <div class="world-card world-title">
      <h1 data-ref="name" data-testid="world-name">Seed Circuit</h1>
      <p data-ref="code" data-testid="world-code"></p>
      <p class="world-character" data-ref="character" data-testid="world-character"></p>
      <p class="world-hint" data-ref="hint"></p>
    </div>
    <div class="world-card world-controls">
      <button type="button" data-ref="play" data-testid="world-play"></button>
      <button type="button" data-ref="toggle" data-testid="world-camera-toggle"></button>
      <button type="button" class="primary" data-ref="new" data-testid="world-new">New island</button>
    </div>
    <div class="world-loading" data-ref="loading" role="status">
      <div class="world-card" data-ref="loadingText">Raising a new island…</div>
    </div>
  </div>
`;

const HINTS: Record<CameraMode, string> = {
  fly: 'Space pauses, up and down arrows change speed, C circles the island, N makes a new one.',
  orbit: 'Drag to turn, scroll to zoom. C flies the lap, N makes a new island.',
};

/**
 * The 3D view of a seed's world: builds it in the worker, then flies a camera
 * round the lap. The camera can be switched to one that circles the island.
 *
 * Address options: `seed=42`; `cam=orbit` to open circling; `lap=0.5` to open
 * half way round the lap; `still=1` to open paused; `look=cut` (or fill, bank,
 * close, water, hairpin, start, summit, climb, sun) or `at=x,z` for a close view of one place;
 * `time=17:45` to open at that time of day instead of the seed's own (held to daylight).
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
  const params = new URL(window.location.href).searchParams;
  const look = params.get('look') ?? '';
  const at = params.get('at') ?? '';
  const startLap = Number(params.get('lap') ?? '0');
  const askedTime = parseClock(params.get('time') ?? '');
  const [earliest, latest] = config.world.sky.hours;
  /** Holds a time of day to the hours seeds pick from. */
  const daylightHour = (hour: number): number => Math.min(latest, Math.max(earliest, hour));
  const fly = config.camera.fly;

  const view = createWorldView(canvas, config.render);
  let orbit: Orbit = { targetX: 0, targetY: 8, targetZ: 0, ...config.camera.orbit.start };
  let mode: CameraMode = params.get('cam') === 'orbit' ? 'orbit' : 'fly';
  let flight: FlyPath | null = null;
  let distance = 0;
  let speed = fly.speed;
  // Anyone who has asked their system for less motion starts paused, as does a still picture.
  let playing = params.get('still') !== '1' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let report: FitReport | null = null;
  let dirty = true;
  /** The time of day shown, and the bearing of the sun's path of the world shown. */
  let hour = 12;
  let bearing = 0;
  /** While a new world is being built nothing is drawn, so a slow machine's drawing does not slow the build. */
  let building = false;

  const setTime = (next: number): void => {
    hour = daylightHour(next);
    view.setDaylight(daylightAt(hour, bearing, config.render.daylight));
    document.body.dataset.worldTime = formatClock(hour);
    dirty = true;
  };

  const renderControls = (): void => {
    ref('play').textContent = playing ? 'Pause' : 'Play';
    ref('play').hidden = mode !== 'fly';
    ref('toggle').textContent = mode === 'fly' ? 'Circle the island' : 'Fly the lap';
    ref('hint').textContent = HINTS[mode];
    document.body.dataset.worldCamera = mode;
  };

  const setMode = (next: CameraMode): void => {
    mode = next;
    dirty = true;
    renderControls();
  };
  const setPlaying = (next: boolean): void => {
    playing = next;
    renderControls();
  };

  const resize = (): void => {
    view.resize(Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight), window.devicePixelRatio || 1);
    dirty = true;
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  const aimCamera = (): void => {
    if (mode === 'fly' && flight) {
      const pose = flight.poseAt(distance);
      view.setCamera(pose.eye, pose.look);
    } else {
      view.setCamera(orbitEye(orbit), { x: orbit.targetX, y: orbit.targetY, z: orbit.targetZ });
    }
  };

  // Draw only when something has changed: a paused or circling camera costs nothing while it is left alone.
  let last = performance.now();
  const frame = (now: number): void => {
    // A long gap (a hidden tab, say) must not fling the camera down the road.
    const seconds = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (mode === 'fly' && playing && flight) {
      distance = (distance + speed * seconds) % flight.length;
      dirty = true;
    }
    if (dirty && !building) {
      aimCamera();
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
    if (!dragging || dragging.id !== event.pointerId || mode !== 'orbit') return;
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
      if (mode !== 'orbit') return;
      event.preventDefault();
      orbit = zoomOrbit(orbit, event.deltaY, config.camera.orbit.nearest, config.camera.orbit.furthest);
      dirty = true;
    },
    { passive: false },
  );

  /** Points the circling camera at the middle of the track, far enough back to see the whole island. */
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
      ...config.camera.orbit.start,
      targetX: (minX + maxX) / 2,
      targetY: height,
      targetZ: (minZ + maxZ) / 2,
      distance: Math.min(config.camera.orbit.furthest, span * config.camera.orbit.fit),
    };
  };

  /** A view from just behind a point on the road, looking level towards where the sun is now. */
  const lookAtSun = (x: number, z: number, height: number): Orbit => {
    const { sun } = daylightAt(hour, bearing, config.render.daylight);
    // The camera stands on the side away from the sun: its angle is measured from the target to the eye.
    const towardsSun = Math.atan2(sun.x, -sun.z);
    return { targetX: x, targetY: height + 8, targetZ: z, angle: -towardsSun, tilt: 0.08, distance: 60 };
  };

  /** The seed last asked for. Its world may still be on its way from the worker. */
  let wantedSeed = -1;
  const show = async (seed: number, opening: boolean): Promise<void> => {
    wantedSeed = seed;
    building = true;
    loading.hidden = false;
    ref('loadingText').textContent = 'Raising a new island…';
    document.body.dataset.worldReady = 'false';
    const url = new URL(window.location.href);
    url.searchParams.set('seed', String(seed));
    window.history.replaceState(null, '', url);
    try {
      const { result, ms } = await genClient().world(seed, config);
      // A newer island was asked for while this one was being raised: drop this one.
      if (wantedSeed !== seed) return;
      building = false;
      view.load(result);
      report = result.report;
      // Only the page's first island honours the address's time; a new island has its own.
      bearing = result.sky.bearing;
      setTime(opening && askedTime !== null ? askedTime : result.sky.hour);

      const winner = result.track.candidates[result.track.winnerIndex]!;
      const groundAt = (x: number, z: number): number => sampleField(result.ground, x, z, 0);
      flight = createFlyPath(winner.line, winner.profile.height, groundAt, fly);
      frameIsland(result);

      // Only the page's first island honours the address's choice of place; a new island starts from its start line.
      const point = opening ? lookAtPoint(at, groundAt) : null;
      const spot =
        point ??
        (opening
          ? (lookAtSpot(look, result.report, groundAt) ??
            lookAtTrack(look, winner.line, winner.sections, groundAt) ??
            lookAtRoad(look, winner.line, winner.profile.height, result.mountains, groundAt) ??
            (look === 'sun' ? lookAtSun(winner.line.x[0]!, winner.line.z[0]!, winner.profile.height[0]!) : null))
          : null);
      if (spot) {
        orbit = spot;
        mode = 'orbit';
      }
      distance = opening && Number.isFinite(startLap) ? (((startLap % 1) + 1) % 1) * flight.length : 0;
      document.body.dataset.worldLook = point ? 'point' : spot ? look : 'island';

      aimCamera();
      view.render();
      dirty = false;
      renderControls();
      ref('name').textContent = result.track.name;
      ref('code').textContent = `Seed ${result.seed} · ${formatSeedCode(result.seed, result.generatorVersion)}`;
      ref('character').textContent = shortCharacter(result.track.character);
      document.title = `${result.track.name} · Seed Circuit`;
      document.body.dataset.worldSeed = String(result.seed);
      document.body.dataset.worldMs = ms.toFixed(0);
      loading.hidden = true;
      document.body.dataset.worldReady = 'true';
    } catch (error) {
      if (wantedSeed === seed) building = false;
      if (wantedSeed === seed) ref('loadingText').textContent = error instanceof Error ? error.message : String(error);
    }
  };

  // Picking a random seed is app code, not generation, so Math.random is fine here.
  const randomSeed = (): number => 1 + Math.floor(Math.random() * 99999);

  ref('play').addEventListener('click', () => setPlaying(!playing));
  ref('toggle').addEventListener('click', () => setMode(mode === 'fly' ? 'orbit' : 'fly'));
  ref('new').addEventListener('click', () => void show(randomSeed(), false));
  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === ' ' && mode === 'fly') setPlaying(!playing);
    else if (key === 'c') setMode(mode === 'fly' ? 'orbit' : 'fly');
    else if (key === 'n') void show(randomSeed(), false);
    else if (key === 'arrowup') speed = Math.min(fly.speedRange[1], speed * 1.25);
    else if (key === 'arrowdown') speed = Math.max(fly.speedRange[0], speed / 1.25);
    else return;
    event.preventDefault();
    // A button that still has focus would otherwise act on the same key press.
    if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
  });

  renderControls();
  const fromUrl = parseSeedInput(params.get('seed') ?? '');
  void show(Math.min(MAX_SEED, Math.max(0, fromUrl ? fromUrl.seed : randomSeed())), true);

  return {
    stats: () => view.stats(),
    pixelCounts: () => view.pixelCounts(),
    orbit: () => orbit,
    camera: () => ({ mode, distance, lapLength: flight?.length ?? 0, playing, speed }),
    report: () => report,
  };
}
