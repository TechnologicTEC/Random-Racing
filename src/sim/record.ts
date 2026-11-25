import type { GameConfig, PhysicsConfig } from '../config';
import { createHasher, type Hasher } from '../core/hash';
import type { WorldResult } from '../gen/types';
import { packInput, unpackInput } from './input';
import type { Rapier } from './physics/rapier';
import { createSim, type Sim } from './sim';

/**
 * A run on record (M5): everything a ghost needs. The inputs are the proof:
 * replayed in a fresh simulation of the same island and handling, from the
 * first step of the countdown, they end on `hash`. The places are for drawing,
 * so no second physics world runs during a race. Plain data only: where a
 * record is kept is the page's business, never the simulation's.
 */
export interface RunRecord {
  /** The layout of the packed bytes (`RECORD_FORMAT`). */
  format: number;
  /** The island's seed and the generator version that built it. */
  seed: number;
  generator: number;
  /** Who drove: the player, or the bot (M5.3b). */
  driver: Driver;
  /** A place is kept every this many steps, from step 0. */
  every: number;
  /** The handling's fingerprint when it was driven (`hashHandling`): a record of other handling is from an older version. */
  handling: string;
  /** Every step's input, packed (`packInput`), from the first step of the countdown. */
  inputs: Uint32Array;
  /** The car every `every` steps from step 0, seven numbers each: position x, y, z and the turn's x, y, z, w. */
  places: Float32Array;
  /** The race's lap and sector times and its total, in steps (`RaceState`). */
  laps: number[];
  splits: number[];
  total: number;
  /** The simulation's fingerprint after the last input. */
  hash: string;
}

export type Driver = 'player' | 'bot';

/**
 * The packed layout's version: bumped whenever the bytes change meaning. 2 (M5.4d): laps counted by the lap gates, 5
 * sectors a lap, and the race's fingerprint with the missed gate; a record of format 1 is refused, its ghost not drawn.
 */
export const RECORD_FORMAT = 2;
/** Numbers kept a place: position (3) and turn (4). */
export const PLACE_SIZE = 7;

/** "SCGH" (Seed Circuit ghost), the first four bytes. */
const MAGIC = [0x53, 0x43, 0x47, 0x48];
const DRIVERS: readonly Driver[] = ['player', 'bot'];
/** Bytes before the arrays. */
const HEADER = 44;

/**
 * A fingerprint of the handling: every number of the car's and the
 * simulation's config, each with its dotted path, keys in sorted order so the
 * order they are written in does not matter. Drawing and camera numbers are
 * left out: they change how a run looks, not where it goes.
 */
export function hashHandling(cfg: Pick<GameConfig, 'car' | 'sim'>): string {
  const hasher = createHasher();
  walk(hasher, cfg.car, 'car');
  walk(hasher, cfg.sim, 'sim');
  return hasher.digest();
}

function walk(hasher: Hasher, value: unknown, path: string): void {
  if (typeof value === 'number') hasher.text(path).numbers([value]);
  else if (typeof value === 'boolean') hasher.text(path).numbers([value ? 1 : 0]);
  else if (typeof value === 'string') hasher.text(path).text(value);
  else if (Array.isArray(value)) value.forEach((inner, i) => walk(hasher, inner, `${path}.${i}`));
  else if (value && typeof value === 'object') {
    for (const key of Object.keys(value).sort()) walk(hasher, (value as Record<string, unknown>)[key], `${path}.${key}`);
  }
}

/**
 * A record as bytes: a 44-byte header (the magic word, the format, the driver,
 * `every`, the seed, the generator version, both fingerprints, the counts and
 * the total), then the laps and splits as float64, the inputs as uint32 and the
 * places as float32, all little-endian. About 52 kB of inputs and 61 kB of
 * places for a 3-lap race.
 */
export function packRun(record: RunRecord): Uint8Array {
  if (record.places.length % PLACE_SIZE !== 0) throw new Error('A run record keeps seven numbers a place');
  const length = HEADER + (record.laps.length + record.splits.length) * 8 + record.inputs.length * 4 + record.places.length * 4;
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  MAGIC.forEach((byte, i) => view.setUint8(i, byte));
  view.setUint16(4, record.format, true);
  view.setUint8(6, DRIVERS.indexOf(record.driver));
  view.setUint8(7, record.every);
  view.setUint32(8, record.seed, true);
  view.setUint32(12, record.generator, true);
  view.setUint32(16, parseInt(record.handling, 16), true);
  view.setUint32(20, parseInt(record.hash, 16), true);
  view.setUint32(24, record.inputs.length, true);
  view.setUint32(28, record.places.length / PLACE_SIZE, true);
  view.setUint8(32, record.laps.length);
  view.setUint8(33, record.splits.length);
  view.setFloat64(36, record.total, true);
  let at = HEADER;
  for (const value of [...record.laps, ...record.splits]) {
    view.setFloat64(at, value, true);
    at += 8;
  }
  for (const value of record.inputs) {
    view.setUint32(at, value, true);
    at += 4;
  }
  for (const value of record.places) {
    view.setFloat32(at, value, true);
    at += 4;
  }
  return bytes;
}

/** A packed record read back. Throws, saying why, for bytes that are not a whole record of this format. */
export function unpackRun(bytes: Uint8Array): RunRecord {
  if (bytes.length < HEADER) throw new Error(`A run record is at least ${HEADER} bytes; these are too short (${bytes.length})`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (MAGIC.some((byte, i) => view.getUint8(i) !== byte)) throw new Error('These bytes are not a run record');
  const format = view.getUint16(4, true);
  if (format !== RECORD_FORMAT) throw new Error(`This run record is in format ${format}; this game reads format ${RECORD_FORMAT}`);
  const driver = DRIVERS[view.getUint8(6)];
  if (!driver) throw new Error('This run record names no known driver');
  const inputCount = view.getUint32(24, true);
  const placeCount = view.getUint32(28, true);
  const lapCount = view.getUint8(32);
  const splitCount = view.getUint8(33);
  const length = HEADER + (lapCount + splitCount) * 8 + inputCount * 4 + placeCount * PLACE_SIZE * 4;
  if (bytes.length !== length) throw new Error(`This run record's length should be ${length} bytes, not ${bytes.length}`);
  let at = HEADER;
  const float64s = (count: number): number[] => {
    const values: number[] = [];
    for (let i = 0; i < count; i++, at += 8) values.push(view.getFloat64(at, true));
    return values;
  };
  const laps = float64s(lapCount);
  const splits = float64s(splitCount);
  const inputs = new Uint32Array(inputCount);
  for (let i = 0; i < inputCount; i++, at += 4) inputs[i] = view.getUint32(at, true);
  const places = new Float32Array(placeCount * PLACE_SIZE);
  for (let i = 0; i < places.length; i++, at += 4) places[i] = view.getFloat32(at, true);
  return {
    format,
    seed: view.getUint32(8, true),
    generator: view.getUint32(12, true),
    driver,
    every: view.getUint8(7),
    handling: hex(view.getUint32(16, true)),
    inputs,
    places,
    laps,
    splits,
    total: view.getFloat64(36, true),
    hash: hex(view.getUint32(20, true)),
  };
}

const hex = (value: number): string => value.toString(16).padStart(8, '0');

/** What a record says about its run besides the run itself. */
export type RecordMeta = Pick<RunRecord, 'seed' | 'generator' | 'driver' | 'every' | 'handling'>;

/** A simulation that keeps a record of its run as it is driven. */
export interface RecordingSim extends Sim {
  /** The run so far: every step's input, the places, and the race and fingerprint as they are now. */
  record(): RunRecord;
}

/**
 * Wraps a simulation so that it records its run: each step's input, packed, and the car's place every `every` steps
 * from the step it was wrapped on, read from the simulation's own state (never from the drawing). Wrap it before its
 * first step, so a race is recorded from the first step of the countdown and its start replays.
 */
export function recordRun(sim: Sim, meta: RecordMeta): RecordingSim {
  const inputs: number[] = [];
  const places: number[] = [];
  let wentBack = false;
  const keepPlace = (): void => {
    const { position: p, rotation: r } = sim.state();
    places.push(p.x, p.y, p.z, r.x, r.y, r.z, r.w);
  };
  keepPlace();
  return {
    step(input) {
      sim.step(input);
      inputs.push(packInput(input));
      if (inputs.length % meta.every === 0) keepPlace();
    },
    state: () => sim.state(),
    hash: () => sim.hash(),
    snapshot: () => sim.snapshot(),
    restore(saved) {
      // A run that went back to a saved moment is no longer one run from the start.
      wentBack = true;
      sim.restore(saved);
    },
    free: () => sim.free(),
    record() {
      if (wentBack) throw new Error('This run went back to a saved moment, so its inputs no longer replay it from the start');
      const race = sim.state().race;
      return {
        format: RECORD_FORMAT,
        ...meta,
        inputs: Uint32Array.from(inputs),
        places: Float32Array.from(places),
        laps: race ? [...race.laps] : [],
        splits: race ? [...race.splits] : [],
        total: race ? race.total : 0,
        hash: sim.hash(),
      };
    },
  };
}

/**
 * Runs a record's inputs in a fresh simulation of its island, with a race, and gives the fingerprint it ends on: the
 * record's own `hash` exactly when the island, the handling and every input are the same as when it was driven.
 */
export function replayRun(rapier: Rapier, world: WorldResult, cfg: PhysicsConfig, record: RunRecord): string {
  if (world.seed !== record.seed) throw new Error(`This record is of seed ${record.seed}, not of seed ${world.seed}`);
  const sim = createSim(rapier, world, cfg, { race: true });
  try {
    for (const packed of record.inputs) sim.step(unpackInput(packed));
    return sim.hash();
  } finally {
    sim.free();
  }
}
