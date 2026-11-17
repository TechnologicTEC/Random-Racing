import './world.css';
import { chaseStart, type ChaseView } from '../camera/chase';
import { createFlyPath, type FlyPath } from '../camera/flyAlong';
import { dragOrbit, orbitEye, zoomOrbit, type Orbit } from '../camera/orbit';
import { lookAtCar, lookAtPoint, lookAtRoad, lookAtSpot, lookAtTrack } from '../camera/spots';
import { config } from '../config';
import { formatSeedCode, MAX_SEED, parseSeedInput } from '../core/seedCode';
import type { CloudCover, FitReport, WoodsKind, WorldResult } from '../gen';
import { sampleField } from '../gen/world/heightfield';
import { formatClock, lightName, parseClock, shortCharacter, shortScenery } from '../debug/trackLab/format';
import { daylightAt } from '../render/daylight';
import { parseQuality, qualitySettings, type QualityLevel } from '../render/quality';
import { kartPose } from '../render/carShape';
import { createFrameMeter, type FrameStats } from '../render/frameMeter';
import { createWorldView, type PixelCounts, type ViewStats, type WorldView } from '../render/worldView';
import { createDevices } from '../input/devices';
import { makeInput, type RawInput } from '../sim/input';
import type { Rapier } from '../sim/physics/rapier';
import { createSim, type CarState, type Sim } from '../sim/sim';
import { startPose } from '../sim/start';
import { genClient } from '../worker/client';
import { driftReadout, mainSurface } from './drive';
import { createDriving } from './driving';
import { nextCamera, openingCamera, switchAddress, type CameraMode } from './route';

export type { CameraMode };

/** The simulation of the island shown, for browser tests and the console (`window.seedCircuit.drive`). */
export interface DriveHandle {
  /** The car as it is now, or null while the simulation is still being built. */
  state(): CarState | null;
  /** The simulation's fingerprint, or null while it is still being built. */
  hash(): string | null;
  /**
   * Takes that many steps at once with that input (nothing pressed if left out), then draws one frame. The page's
   * own loop takes no step until the frame after. For browser tests and the console: no waiting in real time.
   */
  run(steps: number, raw?: RawInput): CarState;
  /** Puts the car back on the start line, as a new simulation. */
  reset(): void;
}

/** What the page offers to automated checks. */
export interface ViewHandle {
  stats(): ViewStats;
  pixelCounts(): PixelCounts;
  orbit(): Orbit;
  /** The flying camera: how far round the lap it is, and whether it is moving. */
  camera(): { mode: CameraMode; distance: number; lapLength: number; playing: boolean; speed: number };
  /** The fit report of the world being shown, once there is one. */
  report(): FitReport | null;
  /** What the latest frames took, in milliseconds. Only frames drawn one straight after another are counted. */
  frames(): FrameStats;
  /** Forgets the frames counted so far. */
  resetFrames(): void;
  /** Sets the waves', clouds' and grass's clock to this many seconds, for checks that compare moments. */
  setClock(seconds: number): void;
  /** The name of the graphics card doing the drawing. */
  graphics(): string;
  /** What the world being shown has for scenery, whether or not it is drawn. */
  decor(): { woods: WoodsKind; trees: number; rocks: number; sky: CloudCover; clouds: number; puffs: number } | null;
  /** The simulation of the island shown. */
  drive: DriveHandle;
}

const TEMPLATE = `
  <div class="world">
    <canvas class="world-canvas" data-ref="canvas" data-testid="world-canvas"></canvas>
    <div class="world-card world-title">
      <h1 data-ref="name" data-testid="world-name">Seed Circuit</h1>
      <p data-ref="code" data-testid="world-code"></p>
      <p class="world-character" data-ref="character" data-testid="world-character"></p>
      <p class="world-character" data-ref="scenery" data-testid="world-scenery"></p>
      <p data-ref="time" data-testid="world-time"></p>
      <p class="world-hint" data-ref="hint" data-testid="world-hint"></p>
    </div>
    <div class="world-card world-controls">
      <button type="button" data-ref="play" data-testid="world-play"></button>
      <button type="button" data-ref="toggle" data-testid="world-camera-toggle"></button>
      <button type="button" data-ref="quality" data-testid="world-quality" title="High draws everything; Low is lighter, for slower machines (Q)"></button>
      <div class="world-time-control">
        <output data-ref="clock" data-testid="world-clock" aria-live="off"></output>
        <input type="range" data-ref="slider" data-testid="world-time-slider" aria-label="Time of day" step="5" />
        <button type="button" data-ref="seedTime" data-testid="world-seed-time" title="Back to the time this seed chose">Seed's time</button>
      </div>
      <button type="button" class="primary" data-ref="new" data-testid="world-new">New island</button>
    </div>
    <div class="world-card world-frames" data-ref="frames" data-testid="world-frames" hidden></div>
    <div class="world-card world-dash" data-ref="dash" data-testid="world-readout" hidden>
      <p class="world-speed-line"><span class="world-speed" data-ref="speed" data-testid="world-speed">0</span><span class="world-unit">km/h</span></p>
      <p class="world-surface" data-ref="surface" data-testid="world-surface"></p>
      <p class="world-drift" data-ref="drift" data-testid="world-drift"><span class="world-tier" data-ref="tier" hidden></span><span data-ref="boost"></span></p>
    </div>
    <div class="world-loading" data-ref="loading" role="status">
      <div class="world-card" data-ref="loadingText">Raising a new island…</div>
    </div>
  </div>
`;

/** Where the browser keeps the quality level chosen last. */
const QUALITY_KEY = 'seedCircuit.quality';

const HINTS: Record<CameraMode, string> = {
  chase:
    'W or up drives, S or down brakes and reverses, A and D steer, R starts again. C changes the camera, N makes a new island. L opens the lab. A controller works too, once a button on it is pressed.',
  fly: 'Space pauses, up and down arrows change speed, C circles the island, N makes a new one. L opens the lab.',
  orbit: 'Drag to turn, scroll to zoom. C drives, N makes a new island. L opens the lab.',
};

/** What the camera button says: the view it changes to. */
const NEXT_VIEW: Record<CameraMode, string> = { chase: 'Drive', fly: 'Fly the lap', orbit: 'Circle the island' };

/**
 * The 3D view of a seed's world: builds it in the worker, then drives the car
 * from the start line with the chase camera behind it. C switches to a camera
 * that flies the lap, then to one that circles the island, then back.
 *
 * The default page. `L` opens the track lab on the same seed (see `app/route.ts`).
 *
 * Address options: `seed=42`; `cam=fly` to open flying the lap and `cam=orbit` to open circling (the car stays
 * where it is until the driving view is back); `lap=0.5` to open flying, half way round the lap; `still=1` to open
 * paused, with the car held at its start; `look=cut` (or fill, bank,
 * close, water, hairpin, start, summit, climb, sun, car) or `at=x,z` for a close view of one place;
 * `time=17:45` to open at that time of day instead of the seed's own (held to daylight);
 * `decor=off` to leave out the trees, rocks and clouds; `grass=off` to leave out the grass blades;
 * `water=off` to leave out the surface of the sea; `fps=1` to open with the frame times showing (the F key shows and hides them);
 * `shadows=off` to leave out every shadow; `shadowSky=0.5` for a shadow to take that share of the sky's light (0 to 1); `quality=low` (or high) to open at that quality, which the page otherwise
 * remembers from last time (the Quality button and the Q key switch it);
 * `sync=1` to wait for the graphics card to finish each frame before the next, so frame times are what frames cost (for `npm run perf`).
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

  // The quality level: the address's, or the one chosen last time in this browser, or High.
  const storedQuality = (): string | null => {
    try {
      return window.localStorage.getItem(QUALITY_KEY);
    } catch {
      return null;
    }
  };
  let quality: QualityLevel = parseQuality(params.get('quality') ?? storedQuality());
  const shownParts = {
    decor: params.get('decor') !== 'off',
    grass: params.get('grass') !== 'off',
    water: params.get('water') !== 'off',
    shadows: params.get('shadows') !== 'off',
  };
  /** Builds the 3D view for a quality level, with the parts the address asked for. */
  // `shadowSky=0.5` tries another share of the sky's light for shadows to take, for judging by eye.
  const askedSky = Number(params.get('shadowSky'));
  const render = params.has('shadowSky') && Number.isFinite(askedSky)
    ? { ...config.render, shadows: { ...config.render.shadows, skyShare: Math.min(1, Math.max(0, askedSky)) } }
    : config.render;
  const makeView = (level: QualityLevel): WorldView => {
    const settings = qualitySettings(render, level);
    const made = createWorldView(canvas, settings.render, settings.pixels);
    made.setDecorShown(shownParts.decor);
    made.setGrassShown(shownParts.grass);
    made.setWaterShown(shownParts.water);
    made.setShadowsShown(shownParts.shadows);
    document.body.dataset.worldQuality = level;
    return made;
  };
  let view = makeView(quality);
  const meter = createFrameMeter(config.render.frames.keep, config.render.frames.target);
  const readout = ref('frames');
  readout.hidden = params.get('fps') !== '1';
  const sync = params.get('sync') === '1';
  document.body.dataset.worldSync = String(sync);
  let orbit: Orbit = { targetX: 0, targetY: 8, targetZ: 0, ...config.camera.orbit.start };
  let mode: CameraMode = openingCamera(params);
  let flight: FlyPath | null = null;
  let distance = 0;
  let speed = fly.speed;
  // A still picture holds everything: the waves, the flight and the car, so pictures repeat exactly.
  const holdStill = params.get('still') === '1';
  // Anyone who has asked their system for less motion starts with the waves and the flight paused, but can still drive.
  const still = holdStill || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let playing = !still;
  // The waves keep moving unless the picture is held still: then they stand at a set moment, so screenshots repeat exactly.
  let waveClock = config.render.water.stillTime;
  view.setCloudTime(waveClock);
  view.setGrassTime(waveClock);
  let report: FitReport | null = null;
  let shown: WorldResult | null = null;
  let dirty = true;
  /** The time of day shown, and the bearing of the sun's path of the world shown. */
  let hour = 12;
  let bearing = 0;
  /** The time the seed of the world shown chose. */
  let seedHour = 12;
  /** While a new world is being built nothing is drawn, so a slow machine's drawing does not slow the build. */
  let building = false;
  /**
   * The physics engine, fetched while the first world is built, and the simulation of the island shown. The
   * simulation is built once both are in, and freed when another island is asked for: a physics world is not
   * freed by itself.
   */
  const engine: Promise<Rapier> = import('../sim/physics/rapier').then(({ loadRapier }) => loadRapier());
  let rapier: Rapier | null = null;
  let sim: Sim | null = null;
  /** The simulation moved on by the fixed-step loop, and the chase camera. */
  const driving = createDriving(config);
  /** The keyboard and any controller. Keys drive only in the driving view. */
  const devices = createDevices(window, config.input, () => mode === 'chase');
  /** Whether the car is drawn in the views other than driving: in the close view of it, or once it has been driven. */
  let lookingAtCar = false;
  let driven = false;
  /** The chase camera before the simulation is built: behind the start pose. */
  let waitingView: ChaseView | null = null;
  /** The height of the ground of the world shown, for the cameras. */
  const groundAt = (x: number, z: number): number => (shown ? sampleField(shown.ground, x, z, 0) : 0);
  /** The car as it is drawn: between the last two steps while driving, as the simulation has it otherwise. */
  const carState = (): CarState | null => (sim ? (driving.shown() ?? sim.state()) : null);
  /** Draws the car, or hides it, and writes the readout. */
  const drawCar = (): void => {
    const state = sim && (mode === 'chase' || lookingAtCar || driven) ? carState() : null;
    view.setCar(state ? kartPose(state, config) : null);
    document.body.dataset.driveCar = state ? 'shown' : 'hidden';
    if (state) {
      const speed = String(Math.round(Math.abs(state.speed) * 3.6));
      if (ref('speed').textContent !== speed) ref('speed').textContent = speed;
      const surface = mainSurface(state.wheels) ?? 'in the air';
      if (ref('surface').textContent !== surface) ref('surface').textContent = surface;
      // The drift: a dot in the tier's colour, and the boost left.
      const drift = driftReadout(state.drift);
      const tier = ref('tier');
      tier.hidden = drift.colour === null;
      if (drift.colour !== null && tier.style.backgroundColor !== drift.colour) tier.style.backgroundColor = drift.colour;
      if (ref('boost').textContent !== drift.boost) ref('boost').textContent = drift.boost;
      document.body.dataset.driveTier = String(drift.tier);
      document.body.dataset.driveStep = String(state.step);
    }
    dirty = true;
  };
  const dropSim = (): void => {
    sim?.free();
    sim = null;
    driving.setSim(null);
    delete document.body.dataset.driveStep;
    drawCar();
  };
  /** Starts a simulation of the world shown, with the car on its start line. */
  const startSim = (world: WorldResult, engine: Rapier): void => {
    const started = performance.now();
    dropSim();
    sim = createSim(engine, world, config);
    driving.setSim(sim);
    document.body.dataset.driveMs = (performance.now() - started).toFixed(0);
    document.body.dataset.driveStep = String(sim.state().step);
    drawCar();
  };
  /** Builds the simulation of a world that has just been shown, unless another island has been asked for meanwhile. */
  const buildSim = async (world: WorldResult): Promise<void> => {
    rapier = await engine;
    if (wantedSeed !== world.seed || shown !== world) return;
    startSim(world, rapier);
  };
  /** Puts the car back on the start line (R, or the controller's Back): a new simulation of the same island. */
  const resetCar = (): void => {
    if (shown && rapier && sim) startSim(shown, rapier);
  };

  const setTime = (next: number): void => {
    hour = daylightHour(next);
    view.setDaylight(daylightAt(hour, bearing, config.render.daylight));
    const clock = formatClock(hour);
    document.body.dataset.worldTime = clock;
    ref('clock').textContent = clock;
    ref('time').textContent = `${clock} · ${lightName(hour)}`;
    const slider = ref<HTMLInputElement>('slider');
    if (document.activeElement !== slider) slider.value = String(Math.round(hour * 60));
    dirty = true;
  };

  const renderControls = (): void => {
    ref('play').textContent = playing ? 'Pause' : 'Play';
    ref('play').hidden = mode !== 'fly';
    ref('toggle').textContent = NEXT_VIEW[nextCamera(mode)];
    ref('hint').textContent = HINTS[mode];
    ref('quality').textContent = `Quality: ${quality === 'high' ? 'High' : 'Low'}`;
    ref('dash').hidden = mode !== 'chase';
    // The chase camera sees a wider view than the others.
    view.setFieldOfView(mode === 'chase' ? config.camera.chase.fieldOfView : config.render.fieldOfView);
    document.body.dataset.worldCamera = mode;
  };

  const setMode = (next: CameraMode): void => {
    if (mode === 'chase') driven = true;
    mode = next;
    // Back in the driving view, the camera starts straight behind the car; out of it, no key is held.
    if (mode === 'chase') driving.snap();
    else devices.release();
    dirty = true;
    renderControls();
    drawCar();
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

  /** Draws the same island again at another quality level, keeping the camera, the time of day and the clocks. */
  const setQuality = (next: QualityLevel): void => {
    quality = next;
    try {
      window.localStorage.setItem(QUALITY_KEY, next);
    } catch {
      // Without storage the choice lasts until the page is closed.
    }
    view.dispose();
    view = makeView(next);
    resize();
    view.setWaveTime(waveClock);
    view.setCloudTime(waveClock);
    view.setGrassTime(waveClock);
    if (shown) view.load(shown);
    drawCar();
    setTime(hour);
    renderControls();
    dirty = true;
  };

  const aimCamera = (): void => {
    const chase = mode === 'chase' ? (driving.view() ?? waitingView) : null;
    if (chase) {
      view.setCamera(chase.eye, chase.look);
      // Wider while a boost runs (the view only changes its projection when the angle does).
      view.setFieldOfView(chase.fieldOfView);
      document.body.dataset.driveFieldOfView = chase.fieldOfView.toFixed(1);
    } else if (mode === 'fly' && flight) {
      const pose = flight.poseAt(distance);
      view.setCamera(pose.eye, pose.look);
    } else {
      view.setCamera(orbitEye(orbit), { x: orbit.targetX, y: orbit.targetY, z: orbit.targetZ });
    }
  };

  /** Writes the latest frame times, and what the last frame drew, on the readout. */
  const renderReadout = (): void => {
    const { count, median } = meter.stats();
    const { triangles, calls } = view.stats();
    const speed = count > 0 ? `${median.toFixed(1)} ms · ${Math.round(1000 / median)} fps` : 'held still';
    readout.textContent = `${speed} · ${Math.round(triangles / 1000)}k triangles · ${calls} calls`;
  };

  // Draw only when something has changed. The moving waves change every frame; a still picture costs nothing while it is left alone.
  let last = performance.now();
  /** Whether the frame before this one was drawn: only then is the time since it the time a frame takes. */
  let drewLast = false;
  let readoutAge = Infinity;
  const frame = (now: number): void => {
    const gap = now - last;
    // A long gap (a hidden tab, say) must not fling the camera down the road.
    const seconds = Math.min(0.05, gap / 1000);
    last = now;
    // The controller's buttons for the page: Y changes the camera in any view, Back starts again while driving.
    const pressed = devices.presses();
    if (pressed.camera) setMode(nextCamera(mode));
    if (pressed.reset && mode === 'chase') resetCar();
    // Driving: the fixed-step loop takes its own measure of the frame (at most five steps), unless the picture is held still.
    if (mode === 'chase' && sim && !building && driving.frame(gap / 1000, makeInput(devices.read()), !holdStill, groundAt)) drawCar();
    if (mode === 'fly' && playing && flight) {
      distance = (distance + speed * seconds) % flight.length;
      dirty = true;
    }
    if (!still) {
      // The clouds drift on the same clock as the waves, down the same wind, and the grass sways in it.
      waveClock += seconds;
      view.setWaveTime(waveClock);
      view.setCloudTime(waveClock);
      view.setGrassTime(waveClock);
      dirty = true;
    }
    if (dirty && !building) {
      aimCamera();
      view.render();
      if (sync) view.finish();
      dirty = false;
      if (drewLast) meter.add(gap);
      drewLast = true;
    } else {
      drewLast = false;
    }
    readoutAge += gap / 1000;
    if (!readout.hidden && readoutAge >= config.render.frames.readoutEvery) {
      renderReadout();
      readoutAge = 0;
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
    dropSim();
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
      shown = result;
      // Only the page's first island honours the address's time; a new island has its own.
      bearing = result.sky.bearing;
      seedHour = result.sky.hour;
      setTime(opening && askedTime !== null ? askedTime : seedHour);

      const winner = result.track.candidates[result.track.winnerIndex]!;
      driven = false;
      // The chase camera, until the simulation is built: behind the car's start pose.
      waitingView = chaseStart({ ...startPose(result, config), velocity: { x: 0, y: 0, z: 0 } }, groundAt, config.camera.chase);
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
            (look === 'sun' ? lookAtSun(winner.line.x[0]!, winner.line.z[0]!, winner.profile.height[0]!) : null) ??
            (look === 'car' ? lookAtCar(startPose(result, config)) : null))
          : null);
      lookingAtCar = opening && look === 'car';
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
      ref('scenery').textContent = shortScenery(result.decor.woods, result.clouds.cover);
      document.title = `${result.track.name} · Seed Circuit`;
      document.body.dataset.worldSeed = String(result.seed);
      document.body.dataset.worldMs = ms.toFixed(0);
      loading.hidden = true;
      document.body.dataset.worldReady = 'true';
      await buildSim(result);
    } catch (error) {
      if (wantedSeed === seed) building = false;
      if (wantedSeed === seed) ref('loadingText').textContent = error instanceof Error ? error.message : String(error);
    }
  };

  // Picking a random seed is app code, not generation, so Math.random is fine here.
  const randomSeed = (): number => 1 + Math.floor(Math.random() * 99999);

  const slider = ref<HTMLInputElement>('slider');
  slider.min = String(earliest * 60);
  slider.max = String(latest * 60);
  slider.addEventListener('input', () => setTime(Number(slider.value) / 60));
  ref('seedTime').addEventListener('click', () => {
    slider.blur();
    setTime(seedHour);
  });
  ref('play').addEventListener('click', () => setPlaying(!playing));
  ref('toggle').addEventListener('click', () => setMode(nextCamera(mode)));
  // A button gives up the focus once clicked, so the keys go back to the car (which ignores them while a button has it).
  root.addEventListener('click', (event) => {
    if (event.target instanceof HTMLButtonElement) event.target.blur();
  });
  ref('new').addEventListener('click', () => void show(randomSeed(), false));
  ref('quality').addEventListener('click', () => setQuality(quality === 'high' ? 'low' : 'high'));
  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    // The time slider takes its own arrow keys.
    if (event.target instanceof HTMLInputElement) return;
    const key = event.key.toLowerCase();
    if (key === ' ' && mode === 'fly') setPlaying(!playing);
    else if (key === 'c') setMode(nextCamera(mode));
    else if (key === 'r' && mode === 'chase') {
      if (!event.repeat) resetCar();
    }
    else if (key === 'n') void show(randomSeed(), false);
    else if (key === 'q') setQuality(quality === 'high' ? 'low' : 'high');
    // The address already holds the seed being shown, so the lab opens on it.
    else if (key === 'l') window.location.assign(switchAddress(window.location.href, 'lab'));
    else if (key === 'f') {
      readout.hidden = !readout.hidden;
      if (!readout.hidden) renderReadout();
    } else if (key === 'arrowup' && mode === 'fly') speed = Math.min(fly.speedRange[1], speed * 1.25);
    else if (key === 'arrowdown' && mode === 'fly') speed = Math.max(fly.speedRange[0], speed / 1.25);
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
    frames: () => meter.stats(),
    resetFrames: () => meter.reset(),
    setClock: (seconds) => {
      waveClock = seconds;
      view.setWaveTime(seconds);
      view.setCloudTime(seconds);
      view.setGrassTime(seconds);
      dirty = true;
    },
    graphics: () => view.graphics(),
    decor: () =>
      shown && {
        woods: shown.decor.woods,
        trees: shown.decor.trees.count,
        rocks: shown.decor.rocks.count,
        sky: shown.clouds.cover,
        clouds: shown.clouds.count,
        puffs: shown.clouds.puffCount,
      },
    drive: {
      state: () => sim?.state() ?? null,
      hash: () => sim?.hash() ?? null,
      run(steps, raw = {}) {
        if (!sim) throw new Error('The simulation is not built yet');
        const state = driving.run(steps, makeInput(raw));
        // Drawn at once, with no step of the page's own and the camera straight behind the car.
        driving.frame(0, makeInput({}), false, groundAt);
        drawCar();
        aimCamera();
        view.render();
        dirty = false;
        return state;
      },
      reset: resetCar,
    },
  };
}
