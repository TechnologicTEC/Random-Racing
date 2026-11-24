import './world.css';
import { chaseStart, type ChaseView } from '../camera/chase';
import { createFlyPath, type FlyPath } from '../camera/flyAlong';
import { dragOrbit, orbitEye, zoomOrbit, type Orbit } from '../camera/orbit';
import { clearOrbit, titleOrbit } from '../camera/orbitFit';
import { lookAtCar, lookAtPoint, lookAtRoad, lookAtSpot, lookAtTrack } from '../camera/spots';
import { config, GENERATOR_VERSION } from '../config';
import { formatSeedCode, MAX_SEED, parseSeedInput, seedInputProblem } from '../core/seedCode';
import type { CloudCover, FitReport, WoodsKind, WorldResult } from '../gen';
import { sampleField } from '../gen/world/heightfield';
import { formatClock, lightName, parseClock, shortCharacter, shortScenery } from '../debug/trackLab/format';
import { daylightAt } from '../render/daylight';
import { parseQuality, qualitySettings, type QualityLevel } from '../render/quality';
import { kartPose } from '../render/carShape';
import type { EffectTextures } from '../render/carView';
import { speedLines } from '../render/driftEffects';
import { loadEffectTextures } from '../render/effectTextures';
import { createFrameMeter, type FrameStats } from '../render/frameMeter';
import { createWorldView, type PixelCounts, type ViewStats, type WorldView } from '../render/worldView';
import { createDevices } from '../input/devices';
import { RACE_LIGHTS, RESPAWN_FADE, type Rgb } from '../render/palette';
import { makeInput, unpackInput, type RawInput } from '../sim/input';
import type { Rapier } from '../sim/physics/rapier';
import { raceSteps } from '../sim/race';
import { createSim, type CarState, type Sim } from '../sim/sim';
import { startPose } from '../sim/start';
import { checkpointCount } from '../sim/track/progress';
import { genClient } from '../worker/client';
import { cancelReadout, driftReadout, mainSurface, placeReadout, respawnFade, type CancelSeen } from './drive';
import { createDriving } from './driving';
import { countdownLights, raceCard, type RaceCard } from './raceCard';
import { backMove, cameraFree, choiceAfter, menuFor, move, steps, type Move, type Screen } from './screens';
import { needsRebuild, rebuildSim, tunedCopy } from './tuning';
import { createTuningPanel } from './tuningPanel';
import { nextCamera, openingCamera, openingScreen, switchAddress, type CameraMode } from './route';

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
  /**
   * Takes one step for each input of a list, packed (`packInput`), then draws one frame, as `run` does: a drive worked
   * out elsewhere (in Node, say) replayed exactly.
   */
  replay(inputs: number[]): CarState;
  /** Puts the car back on the start line, as a new simulation. (R puts it back at the last checkpoint, through the simulation.) */
  reset(): void;
}

/** What the page offers to automated checks. */
export interface ViewHandle {
  stats(): ViewStats;
  pixelCounts(): PixelCounts;
  orbit(): Orbit;
  /** The flying camera: how far round the lap it is, and whether it is moving. */
  camera(): { mode: CameraMode; distance: number; lapLength: number; playing: boolean; speed: number; eye: { x: number; y: number; z: number } };
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
    <div class="world-fade" data-ref="fade" data-testid="world-fade" aria-hidden="true"></div>
    <div class="world-card world-title" data-ref="titleCard">
      <h1 data-ref="name" data-testid="world-name">Seed Circuit</h1>
      <p data-ref="code" data-testid="world-code"></p>
      <p class="world-character" data-ref="character" data-testid="world-character"></p>
      <p class="world-character" data-ref="scenery" data-testid="world-scenery"></p>
      <p data-ref="time" data-testid="world-time"></p>
      <p class="world-hint" data-ref="hint" data-testid="world-hint"></p>
    </div>
    <div class="world-card world-controls" data-ref="controls" data-testid="world-controls">
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
      <p class="world-place" data-ref="place" data-testid="world-place"></p>
      <p class="world-drift" data-ref="drift" data-testid="world-drift"><span class="world-tier" data-ref="tier" hidden></span><span data-ref="boost"></span></p>
      <p class="world-cancel" data-ref="cancel" data-testid="world-cancel" hidden></p>
    </div>
    <div class="world-card world-lights" data-ref="lights" data-testid="race-lights" aria-hidden="true" hidden>
      <span class="world-light" data-ref="light1"></span><span class="world-light" data-ref="light2"></span><span class="world-light" data-ref="light3"></span>
    </div>
    <div class="world-card world-race" data-ref="race" data-testid="race-card" hidden>
      <p class="world-race-lap" data-ref="raceLap" data-testid="race-lap"></p>
      <p class="world-race-time" data-ref="raceTime" data-testid="race-time"></p>
      <div class="world-race-rows" data-ref="raceRows"></div>
    </div>
    <div class="world-card world-menu" data-ref="menu" data-testid="menu" hidden>
      <h2 data-ref="menuHeading" data-testid="menu-heading"></h2>
      <div class="world-menu-body" data-ref="menuBody"></div>
      <div class="world-menu-choices" data-ref="menuChoices"></div>
      <form class="world-menu-seed" data-ref="seedForm" data-testid="seed-form" hidden>
        <input type="text" data-ref="seedInput" data-testid="seed-input" placeholder="Seed or share code" aria-label="Seed or share code" autocomplete="off" spellcheck="false" />
        <button type="submit" data-testid="seed-go">Go</button>
      </form>
      <p class="world-menu-problem" data-ref="seedProblem" data-testid="seed-problem" role="alert" hidden></p>
    </div>
    <div class="world-loading" data-ref="loading" role="status">
      <div class="world-card" data-ref="loadingText">Raising a new island…</div>
    </div>
  </div>
`;

/** Where the browser keeps the quality level chosen last. */
const QUALITY_KEY = 'seedCircuit.quality';

/** The keys for driving, said on the corner card in a race and in free driving. */
const DRIVING_HINT = 'W or up drives, S or down brakes and reverses, A and D steer, Space or Shift held while steering drifts, R goes back to the last checkpoint.';
/** On a menu card: the keys and the controller's buttons for it. */
const MENU_HINT = 'Up and down choose, Enter picks, Esc goes back; on a controller the D-pad or stick, A and B. L opens the lab.';

const HINTS: Record<CameraMode, string> = {
  chase: `${DRIVING_HINT} Esc pauses. C changes the camera, N makes a new island, T tunes the car. L opens the lab. A controller works too, once a button on it is pressed.`,
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
 * `sync=1` to wait for the graphics card to finish each frame before the next, so frame times are what frames cost (for `npm run perf`);
 * `mode=race` to race at once (M4.2c): the car held through a 3-second countdown, then 3 laps timed; `mode=free` to drive with no clock.
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
  // What the page opens on (M4.4): the title card, a race at once (`mode=race`), or free driving (`mode=free`).
  const opening = openingScreen(params);
  /** The screen the page is on (`screens.ts`); the title comes in once the island is. */
  let screen: Screen = opening === 'title' ? { name: 'loading' } : { name: opening };
  document.body.dataset.screen = screen.name;
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
    // `bloom=0` (or `off`) turns off the glow round the drift's effects (6h-5).
    bloom: params.get('bloom') !== '0' && params.get('bloom') !== 'off',
  };
  /** The drift effects' pictures, once loaded: kept, so a view rebuilt for another quality level has them too. */
  let effectTextures: EffectTextures | null = null;
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
    made.setBloom(shownParts.bloom);
    if (effectTextures) made.setEffectTextures(effectTextures);
    document.body.dataset.worldQuality = level;
    return made;
  };
  let view = makeView(quality);
  document.body.dataset.effects = 'loading';
  document.body.dataset.bloom = String(shownParts.bloom);
  loadEffectTextures(import.meta.env.BASE_URL)
    .then((textures) => {
      effectTextures = textures;
      view.setEffectTextures(textures);
      document.body.dataset.effects = 'ready';
    })
    .catch(() => {
      // The effects are still drawn, as soft dots.
      document.body.dataset.effects = 'failed';
    });
  const meter = createFrameMeter(config.render.frames.keep, config.render.frames.target);
  const readout = ref('frames');
  readout.hidden = params.get('fps') !== '1';
  const sync = params.get('sync') === '1';
  document.body.dataset.worldSync = String(sync);
  let orbit: Orbit = { targetX: 0, targetY: 8, targetZ: 0, ...config.camera.orbit.start };
  // Behind the title card the camera circles the island.
  let mode: CameraMode = opening === 'title' ? 'orbit' : openingCamera(params);
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
  /** What the readout last saw of the slides' ends (step 10a). */
  let cancelSeen: CancelSeen | null = null;
  /**
   * The page's own copy of the config, which the tuning panel (T) changes: the simulation, the chase camera and the
   * car's drawing use it. The shared config, and every fingerprint made from it, never change.
   */
  const tuned = tunedCopy(config);
  /** The simulation moved on by the fixed-step loop, and the chase camera. */
  const driving = createDriving(tuned);
  /** The keyboard and any controller. Keys drive only in the driving view. */
  const devices = createDevices(window, config.input, () => mode === 'chase' && steps(screen));
  /** Whether the car is drawn in the views other than driving: in the close view of it, or once it has been driven. */
  let lookingAtCar = false;
  let driven = false;
  /** The chase camera before the simulation is built: behind the start pose. */
  let waitingView: ChaseView | null = null;
  /** The height of the ground of the world shown, for the cameras. */
  const groundAt = (x: number, z: number): number => (shown ? sampleField(shown.ground, x, z, 0) : 0);
  /** The car as it is drawn: between the last two steps while driving, as the simulation has it otherwise. */
  const carState = (): CarState | null => (sim ? (driving.shown() ?? sim.state()) : null);
  /** The race's cards as last written, so each is written again only when it changes. */
  let raceRowsShown = '';
  /** The countdown's lights at the top middle and the race card in the top right corner, while a race is driven (M4.3). */
  const drawRace = (state: CarState | null): void => {
    const race = state?.race ?? null;
    const sps = tuned.sim.stepsPerSecond;
    const lights = countdownLights(race, raceSteps(tuned.sim.race, sps), sps, tuned.render.race);
    const box = ref('lights');
    box.hidden = !lights.shown;
    box.dataset.lit = String(lights.lit);
    box.dataset.green = String(lights.green);
    const opacity = lights.opacity.toFixed(3);
    if (box.style.opacity !== opacity) box.style.opacity = opacity;
    for (const k of [1, 2, 3]) {
      const colour = cssColour(k > lights.lit ? RACE_LIGHTS.off : lights.green ? RACE_LIGHTS.green : RACE_LIGHTS.red);
      const light = ref(`light${k}`);
      if (light.style.backgroundColor !== colour) light.style.backgroundColor = colour;
    }
    const card = ref('race');
    card.hidden = race === null;
    if (!race) return;
    const view = raceCard(race, tuned.sim.race, sps);
    if (ref('raceLap').textContent !== view.lap) ref('raceLap').textContent = view.lap;
    if (ref('raceTime').textContent !== view.time) ref('raceTime').textContent = view.time;
    const rows = raceRows(view);
    if (rows !== raceRowsShown) {
      ref('raceRows').innerHTML = rows;
      raceRowsShown = rows;
    }
  };
  /** Draws the car, or hides it, and writes the readout. */
  const drawCar = (): void => {
    const state = sim && (mode === 'chase' || lookingAtCar || driven) ? carState() : null;
    view.setCar(state ? kartPose(state, tuned) : null);
    // Speed lines while a boost runs, in the driving view only.
    view.setSpeedLines(state && mode === 'chase' ? speedLines(state.drift, state.step, tuned.render.car, tuned.sim.stepsPerSecond) : []);
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
      // Why the last slide was cancelled, for a moment after (step 10a).
      const cancel = cancelReadout(cancelSeen, state.drift, state.step, Math.round(tuned.render.cancelShown * tuned.sim.stepsPerSecond));
      cancelSeen = cancel.seen;
      const cancelLine = ref('cancel');
      if (cancelLine.textContent !== cancel.text) cancelLine.textContent = cancel.text;
      cancelLine.hidden = cancel.text === '';
      document.body.dataset.driveStep = String(state.step);
      // The place on the lap, and the fade to white and back over a respawn.
      const line = shown ? shown.track.candidates[shown.track.winnerIndex]!.line : null;
      const place = line ? placeReadout(state.progress, line.length, checkpointCount(line, tuned.sim.progress)) : '';
      if (ref('place').textContent !== place) ref('place').textContent = place;
      document.body.dataset.driveRespawns = String(state.respawn.respawns);
    }
    drawRace(state && mode === 'chase' ? state : null);
    const fade = state && mode === 'chase' ? respawnFade(state.respawn, state.step, tuned.render.respawnFade, tuned.sim.stepsPerSecond) : 0;
    const opacity = fade.toFixed(3);
    if (ref('fade').style.opacity !== opacity) ref('fade').style.opacity = opacity;
    document.body.dataset.driveFade = String(Number(opacity));
    dirty = true;
  };
  const dropSim = (): void => {
    sim?.free();
    sim = null;
    cancelSeen = null;
    driving.setSim(null);
    delete document.body.dataset.driveStep;
    drawCar();
  };
  /** Starts a simulation of the world shown, with the car on its start line. */
  const startSim = (world: WorldResult, engine: Rapier): void => {
    const started = performance.now();
    dropSim();
    // A race only on the race's screen: the title, free driving and the rest drive with no clock.
    sim = createSim(engine, world, tuned, { race: screen.name === 'race' });
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
  /** Whether a car setting has been moved on the tuning panel since the simulation was last built, and how many times it has been. */
  let rebuildWanted = false;
  let rebuilds = 0;
  document.body.dataset.tuningBuilds = '0';
  // The fade over a respawn takes its colour from the palette.
  ref('fade').style.backgroundColor = `rgb(${RESPAWN_FADE.map((c) => Math.round(c * 255)).join(', ')})`;
  const panel = createTuningPanel(ref('dash').parentElement!, tuned, (path) => {
    // The camera reads its settings afresh each frame; the car's are built into its simulation.
    if (needsRebuild(path)) rebuildWanted = true;
    dirty = true;
  });
  /** Builds the simulation again with the tuned settings, carrying on from where the car is: at most once a frame. */
  const applyTuning = (): void => {
    if (!rebuildWanted || !sim || !shown || !rapier) return;
    rebuildWanted = false;
    const started = performance.now();
    const [world, engine] = [shown, rapier];
    const race = sim.state().race !== null;
    sim = rebuildSim(sim, (cfg) => createSim(engine, world, cfg, { race }), tuned);
    driving.replaceSim(sim);
    rebuilds++;
    document.body.dataset.tuningBuilds = String(rebuilds);
    document.body.dataset.tuningMs = (performance.now() - started).toFixed(0);
  };
  /** Puts the car back on the start line as a new simulation of the same island (`drive.reset`, for tests and the console). */
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
    // In a race, on the title and on the cards the camera is chosen for the player (M4.4).
    ref('toggle').hidden = !cameraFree(screen);
    ref('new').hidden = move(screen, 'newTrack') === null;
    ref('hint').textContent = menuFor(screen).length > 0 ? MENU_HINT : screen.name === 'race' ? `${DRIVING_HINT} Esc pauses.` : HINTS[mode];
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

  /** Where the camera was last put, for checks. */
  let shownEye = { x: 0, y: 0, z: 0 };
  const aimCamera = (): void => {
    const chase = mode === 'chase' ? (driving.view() ?? waitingView) : null;
    if (chase) {
      shownEye = chase.eye;
      view.setCamera(chase.eye, chase.look);
      // Wider while a boost runs (the view only changes its projection when the angle does).
      view.setFieldOfView(chase.fieldOfView);
      document.body.dataset.driveFieldOfView = chase.fieldOfView.toFixed(1);
    } else if (mode === 'fly' && flight) {
      const pose = flight.poseAt(distance);
      shownEye = pose.eye;
      view.setCamera(pose.eye, pose.look);
    } else {
      // Never under the ground or the sea, however it is dragged, zoomed or turned (Tane, the check-in after M4.4).
      shownEye = orbitEye(clearOrbit(orbit, groundAt, config.camera.orbit.clearance));
      view.setCamera(shownEye, { x: orbit.targetX, y: orbit.targetY, z: orbit.targetZ });
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
    // The controller's buttons for the page: Y changes the camera in free driving, Start pauses and resumes, and on a
    // menu card the D-pad or stick, A and B choose, pick and go back.
    applyTuning();
    const pressed = devices.presses();
    if (pressed.camera && cameraFree(screen)) setMode(nextCamera(mode));
    if (pressed.pause) act(screen.name === 'paused' ? 'resume' : 'pause');
    const menu = menuFor(screen);
    if (menu.length > 0 && (pressed.up || pressed.down)) setChoice(choiceAfter(choice, menu.length, pressed.up ? -1 : 1));
    if (menu.length > 0 && pressed.confirm) act(menu[choice]!.move);
    if (pressed.back) {
      const back = backMove(screen);
      if (back) act(back);
    }
    // The controller's Back reaches the simulation in the input record, as R does: it puts the car back itself.
    // Driving: the fixed-step loop takes its own measure of the frame (at most five steps), unless the picture is held still.
    // Paused, on the title and on the results, no step is taken and nothing pressed is recorded.
    if (steps(screen) && mode === 'chase' && sim && !building && driving.frame(gap / 1000, makeInput(devices.read()), !holdStill, groundAt)) drawCar();
    checkFinished();
    // Behind the title and results cards the camera circles the island by itself.
    if (!still && mode === 'orbit' && (screen.name === 'title' || screen.name === 'results') && !dragging) {
      orbit = { ...orbit, angle: orbit.angle + config.camera.orbit.turn * seconds };
      dirty = true;
    }
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

  /** The circling camera behind the title and results cards: close in round the track (`titleOrbit`, Tane after the check-in). */
  const frameTrack = (world: WorldResult): void => {
    const { line, profile } = world.track.candidates[world.track.winnerIndex]!;
    orbit = titleOrbit(line, profile.height, groundAt, config.camera.orbit);
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
  /** How many islands have been asked of the worker: a restart builds none (M4.5). */
  let worldBuilds = 0;
  const show = async (seed: number, opening: boolean): Promise<void> => {
    wantedSeed = seed;
    building = true;
    worldBuilds++;
    document.body.dataset.worldBuilds = String(worldBuilds);
    dropSim();
    loading.hidden = false;
    ref('loadingText').textContent = 'Raising a new island…';
    document.body.dataset.worldReady = 'false';
    const url = new URL(window.location.href);
    url.searchParams.set('seed', String(seed));
    // A new island comes in at its own time of day, so the address no longer names one.
    if (!opening) url.searchParams.delete('time');
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
      // A new island comes in on the title card (M4.4).
      if (screen.name === 'loading') act('loaded');
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
  /** Writes the time of day chosen into the address as `time=`, or takes it out (null: the seed's own), so the address shares it (M4.5). */
  const addressTime = (chosen: number | null): void => {
    const url = new URL(window.location.href);
    if (chosen === null) url.searchParams.delete('time');
    else url.searchParams.set('time', formatClock(chosen));
    window.history.replaceState(null, '', url);
  };
  slider.addEventListener('input', () => {
    setTime(Number(slider.value) / 60);
    addressTime(hour);
  });
  ref('seedTime').addEventListener('click', () => {
    slider.blur();
    setTime(seedHour);
    addressTime(null);
  });
  // A seed or share code typed on the title card (M4.5): opened if it reads as a seed of this generator, or why not said under it.
  const seedInput = ref<HTMLInputElement>('seedInput');
  const seedProblem = ref('seedProblem');
  ref('seedForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const problem = seedInputProblem(seedInput.value, GENERATOR_VERSION);
    seedProblem.textContent = problem ?? '';
    seedProblem.hidden = problem === null;
    const parsed = parseSeedInput(seedInput.value);
    if (problem !== null || !parsed) return;
    seedInput.value = '';
    seedInput.blur();
    act('enterSeed', parsed.seed);
  });
  // Esc in the box goes back to the choices, as the other keys there are the box's own.
  seedInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    setChoice(choice);
  });
  ref('play').addEventListener('click', () => setPlaying(!playing));
  ref('toggle').addEventListener('click', () => setMode(nextCamera(mode)));
  // A button gives up the focus once clicked, so the keys go back to the car (which ignores them while a button has it).
  root.addEventListener('click', (event) => {
    if (event.target instanceof HTMLButtonElement) event.target.blur();
  });
  ref('new').addEventListener('click', () => act('newTrack'));
  ref('quality').addEventListener('click', () => setQuality(quality === 'high' ? 'low' : 'high'));
  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    // The time slider takes its own arrow keys.
    if (event.target instanceof HTMLInputElement) return;
    const key = event.key.toLowerCase();
    // The menu cards and the pause (M4.4): Esc goes back, up and down choose, Enter picks.
    const menu = menuFor(screen);
    if (key === 'escape') {
      const back = backMove(screen);
      if (back) act(back);
      event.preventDefault();
      return;
    }
    if (menu.length > 0 && (key === 'arrowup' || key === 'arrowdown')) {
      setChoice(choiceAfter(choice, menu.length, key === 'arrowup' ? -1 : 1));
      event.preventDefault();
      return;
    }
    if (menu.length > 0 && key === 'enter') {
      // A choice with the focus is pressed by Enter itself; otherwise Enter picks the choice shown as chosen.
      if (!choiceButtons().includes(document.activeElement as HTMLButtonElement)) {
        act(menu[choice]!.move);
        event.preventDefault();
      }
      return;
    }
    if (key === ' ' && mode === 'fly') setPlaying(!playing);
    else if (key === 'c') {
      if (cameraFree(screen)) setMode(nextCamera(mode));
    } else if (key === 'n') act('newTrack');
    else if (key === 't') panel.toggle();
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

  /** The choice on the menu card shown as chosen, which Enter and the controller's A pick. */
  let choice = 0;
  const choiceButtons = (): HTMLButtonElement[] => [...ref('menuChoices').querySelectorAll<HTMLButtonElement>('button')];
  const setChoice = (index: number): void => {
    choice = index;
    const buttons = choiceButtons();
    buttons.forEach((button, k) => button.classList.toggle('chosen', k === index));
    buttons[index]?.focus();
  };
  /** A line of text on the menu card. */
  const line = (text: string, className = '', testId = ''): HTMLElement => {
    const p = document.createElement('p');
    p.textContent = text;
    if (className) p.className = className;
    if (testId) p.dataset.testid = testId;
    return p;
  };
  /** Writes the card in the middle for the screen the page is on, or hides it while the car is driven (Tane, M4.0). */
  const renderScreen = (): void => {
    document.body.dataset.screen = screen.name;
    const menu = menuFor(screen);
    ref('menu').hidden = menu.length === 0;
    // On the title the card in the middle has the island's name, so the corner card stands aside.
    ref('titleCard').hidden = screen.name === 'title';
    // A seed or share code is typed on the title only; what was wrong with the last one goes with it.
    ref('seedForm').hidden = screen.name !== 'title';
    seedProblem.hidden = true;
    if (menu.length === 0) return;
    const name = shown?.track.name ?? 'Seed Circuit';
    const code = ref('code').textContent ?? '';
    const body: HTMLElement[] = [];
    if (screen.name === 'title') {
      ref('menuHeading').textContent = name;
      body.push(line(code, '', 'menu-code'), line(ref('character').textContent ?? '', 'world-menu-quiet'));
    } else if (screen.name === 'paused') {
      ref('menuHeading').textContent = 'Paused';
      body.push(line(name, 'world-menu-quiet'));
    } else {
      // The results say which island this was, with the code to share it by (M4.5).
      ref('menuHeading').textContent = 'Finished';
      body.push(line(name, 'world-menu-quiet', 'menu-name'), line(code, 'world-menu-quiet', 'menu-code'));
      const race = sim?.state().race;
      if (race) {
        const card = raceCard(race, tuned.sim.race, tuned.sim.stepsPerSecond);
        body.push(line(card.time, 'world-menu-total', 'menu-total'));
        card.laps.forEach((lap, i) => {
          const row = line('', `world-menu-lap${lap.best ? ' world-race-accent' : ''}`, 'menu-lap');
          const label = document.createElement('span');
          label.textContent = `Lap ${i + 1}`;
          const time = document.createElement('span');
          time.textContent = lap.time;
          row.append(label, time);
          body.push(row);
        });
      }
    }
    ref('menuBody').replaceChildren(...body);
    ref('menuChoices').replaceChildren(
      ...menu.map((option, i) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = option.label;
        button.dataset.testid = 'menu-choice';
        button.addEventListener('click', () => act(option.move));
        button.addEventListener('focus', () => {
          choice = i;
          choiceButtons().forEach((other, k) => other.classList.toggle('chosen', k === i));
        });
        return button;
      }),
    );
    setChoice(0);
  };
  /** Makes a move between the screens (`screens.ts`), if the screen allows it, and shows where it leads. */
  function act(m: Move, seed?: number): void {
    const next = move(screen, m);
    if (!next) return;
    screen = next;
    if (m === 'start' || m === 'freeDrive' || m === 'restart') {
      // A new simulation of the same island, a race on the race's screen, and the camera behind the car.
      if (shown && rapier) startSim(shown, rapier);
      setMode('chase');
      driving.snap();
    } else if (m === 'pause') {
      devices.release();
    } else if (m === 'quit' || m === 'finished' || m === 'loaded') {
      // Off the road: the camera circles close in round the track behind the card. Back on the title the car is put back on the line.
      if (shown) frameTrack(shown);
      if (m === 'quit' && shown && rapier) startSim(shown, rapier);
      setMode('orbit');
      if (m !== 'finished') driven = false;
    } else if (m === 'newTrack' || m === 'enterSeed') {
      // A new island: the one typed, or any.
      void show(seed ?? randomSeed(), false);
    }
    renderScreen();
    renderControls();
    drawCar();
  }
  /** "Finished" has shown for its two seconds: on to the results (M4.4). */
  const checkFinished = (): void => {
    if (screen.name !== 'race' || !sim) return;
    const race = sim.state().race;
    if (race?.phase === 'finished' && race.finishedSteps >= raceSteps(tuned.sim.race, tuned.sim.stepsPerSecond).finishedFor) act('finished');
  };
  // A race or a drive left in a hidden tab is paused, so nothing happens while nobody is looking.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && steps(screen)) act('pause');
  });

  renderControls();
  renderScreen();
  const fromUrl = parseSeedInput(params.get('seed') ?? '');
  void show(Math.min(MAX_SEED, Math.max(0, fromUrl ? fromUrl.seed : randomSeed())), true);

  return {
    stats: () => view.stats(),
    pixelCounts: () => view.pixelCounts(),
    orbit: () => orbit,
    camera: () => ({ mode, distance, lapLength: flight?.length ?? 0, playing, speed, eye: { ...shownEye } }),
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
      run(count, raw = {}) {
        if (!sim) throw new Error('The simulation is not built yet');
        applyTuning();
        const state = driving.run(count, makeInput(raw));
        // Drawn at once, with no step of the page's own and the camera straight behind the car.
        driving.frame(0, makeInput({}), false, groundAt);
        drawCar();
        checkFinished();
        aimCamera();
        view.render();
        dirty = false;
        return state;
      },
      replay(inputs) {
        if (!sim) throw new Error('The simulation is not built yet');
        applyTuning();
        let state = sim.state();
        for (const packed of inputs) state = driving.run(1, unpackInput(packed));
        driving.frame(0, makeInput({}), false, groundAt);
        drawCar();
        checkFinished();
        aimCamera();
        view.render();
        dirty = false;
        return state;
      },
      reset: resetCar,
    },
  };
}

/** A palette colour (0 to 1) as a CSS colour. */
function cssColour(colour: Rgb): string {
  return `rgb(${colour.map((c) => Math.round(c * 255)).join(', ')})`;
}

/** The race card's rows under its time: last and best and the sectors while racing, every lap once finished. */
function raceRows(view: RaceCard): string {
  const row = (testId: string, name: string, time: string, extra = '', accent = false): string =>
    `<p class="world-race-row${accent ? ' world-race-accent' : ''}" data-testid="${testId}-row"><span>${name}</span><span data-testid="${testId}">${time}</span>${extra}</p>`;
  if (view.finished) return view.laps.map((lap, i) => row('race-lap-time', `Lap ${i + 1}`, lap.time, '', lap.best)).join('');
  const sectors = view.sectors.map((sector, k) => {
    const gap = sector?.gap ? `<span class="world-race-gap${sector.quicker ? ' world-race-accent' : ''}">${sector.gap}</span>` : '<span class="world-race-gap"></span>';
    return `<p class="world-race-row world-race-sector" data-testid="race-sector"><span>S${k + 1}</span><span>${sector?.time ?? '–'}</span>${gap}</p>`;
  });
  return row('race-last', 'Last', view.last ?? '–') + row('race-best', 'Best', view.best ?? '–') + sectors.join('');
}
