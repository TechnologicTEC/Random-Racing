import type { Range, WaterConfig } from '../config';

/**
 * The sea's waves, as plain numbers. Nothing here knows about Three.js.
 *
 * Several trains of waves travel roughly down the wind, each a different
 * length. What keeps them from making a regular pattern:
 * - each train builds up and dies down in patches (waves come in groups);
 * - each train's crests are pushed forward and back from patch to patch, so
 *   they bend and come sooner or later;
 * - crests are peaked, with broad troughs between.
 *
 * `waveField` does the sums here so they can be tested; `wavesGlsl` writes the
 * same sums for the water shader. Change one and you must change the other.
 */

/** One train of waves, worked out from its settings. */
export interface WaveTrain {
  /** Unit vector of the way it travels across the map. */
  dx: number;
  dz: number;
  /** Metres from crest to crest, and the usual height of its crests. */
  length: number;
  height: number;
  /** Radians of its cycle per metre, and per second. */
  k: number;
  omega: number;
  /** Size of its patches, in metres, and how fast they travel (half the speed of the crests, as at sea). */
  patch: number;
  patchSpeed: number;
  /** Where its patches sit in the noise, so no two trains share theirs; and where in its cycle it starts. */
  ox: number;
  oz: number;
  phase: number;
}

/** Pull of gravity, in metres per second squared: it sets how fast a wave of a given length travels. */
const GRAVITY = 9.81;

export function waveSet(cfg: WaterConfig): WaveTrain[] {
  const wind = Math.atan2(cfg.wind[1], cfg.wind[0]);
  return cfg.waves.map((wave, i) => {
    const angle = wind + (wave.angle * Math.PI) / 180;
    const k = (2 * Math.PI) / wave.length;
    const omega = Math.sqrt(GRAVITY * k) * cfg.speed;
    return {
      dx: Math.cos(angle),
      dz: Math.sin(angle),
      length: wave.length,
      height: wave.height,
      k,
      omega,
      patch: cfg.groups.lengths * wave.length,
      patchSpeed: omega / k / 2,
      ox: 3.7 + i * 17.31,
      oz: 11.1 + i * 29.73,
      phase: i * 2.399963,
    };
  });
}

/** Scrambles a whole number into another, the same way in the shader (32-bit sums that wrap round). */
function scramble(n: number): number {
  n ^= n >>> 15;
  n = Math.imul(n, 2246822519);
  n ^= n >>> 13;
  n = Math.imul(n, 3266489917);
  n ^= n >>> 16;
  return n >>> 0;
}

/** Three numbers from 0 to 1 for a square of the noise grid. */
function cellNoise(cx: number, cz: number): [number, number, number] {
  const a = scramble((Math.imul(cx, 374761393) + Math.imul(cz, 668265263)) | 0);
  const b = scramble((a + 2654435769) | 0);
  const c = scramble((b + 2654435769) | 0);
  return [a / 4294967295, b / 4294967295, c / 4294967295];
}

/** Three smooth noises at a point, each from 0 to 1. */
function patchNoise(x: number, z: number): [number, number, number] {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  let fx = x - ix;
  let fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fz = fz * fz * (3 - 2 * fz);
  const p00 = cellNoise(ix, iz);
  const p10 = cellNoise(ix + 1, iz);
  const p01 = cellNoise(ix, iz + 1);
  const p11 = cellNoise(ix + 1, iz + 1);
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const top = p00[c]! + (p10[c]! - p00[c]!) * fx;
    const bottom = p01[c]! + (p11[c]! - p01[c]!) * fx;
    out[c] = top + (bottom - top) * fz;
  }
  return out;
}

const smooth = (from: number, to: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/**
 * The sea at a point and a moment: its height above its troughs, in metres,
 * and its slope (metres of height per metre towards +x and towards +z).
 *
 * @param seconds the wave clock
 */
export function waveField(cfg: WaterConfig, x: number, z: number, seconds: number, trains: readonly WaveTrain[] = cachedSet(cfg)): { height: number; slopeX: number; slopeZ: number } {
  let height = 0;
  let slopeX = 0;
  let slopeZ = 0;
  for (const w of trains) {
    // The train's patches, drifting down its way at half the speed of its crests.
    const drift = w.patchSpeed * seconds;
    const n = patchNoise((x - w.dx * drift) / w.patch + w.ox, (z - w.dz * drift) / w.patch + w.oz);
    const push = cfg.bend * w.length;
    const px = x + push * (2 * n[0] - 1);
    const pz = z + push * (2 * n[1] - 1);
    const gain = cfg.groups.gain[0] + (cfg.groups.gain[1] - cfg.groups.gain[0]) * smooth(0.25, 0.75, n[2]);

    const theta = w.k * (w.dx * px + w.dz * pz) - w.omega * seconds + w.phase;
    const up = 0.5 + 0.5 * Math.sin(theta);
    const a = w.height * gain;
    height += a * Math.pow(up, cfg.crest);
    const steep = a * w.k * cfg.crest * 0.5 * Math.pow(up, cfg.crest - 1) * Math.cos(theta);
    slopeX += w.dx * steep;
    slopeZ += w.dz * steep;
  }
  return { height, slopeX, slopeZ };
}

let cached: { cfg: WaterConfig; trains: WaveTrain[] } | null = null;
function cachedSet(cfg: WaterConfig): WaveTrain[] {
  if (cached?.cfg !== cfg) cached = { cfg, trains: waveSet(cfg) };
  return cached.trains;
}

/**
 * How much of a wave is drawn, 0 to 1, where one pixel covers `footprint`
 * metres of sea measured the way the wave travels.
 */
export function resolved(footprint: number, length: number, range: Range): number {
  return 1 - smooth(range[0], range[1], footprint / length);
}

const float = (value: number): string => (Number.isInteger(value) ? `${value}.0` : String(value));

/**
 * The shader's version of `waveField`. It defines
 * `vec2 seaSlope(vec2 p, float seconds, vec2 perPixelX, vec2 perPixelY, out float lost, out float rise)`:
 * the slope at `p`, leaving out what the pixel cannot show (`perPixelX` and
 * `perPixelY` are how far `p` moves from one pixel to the next across and down
 * the screen). `lost` is how rough the waves left out would have made the sea;
 * `rise` is the height of the sea above its troughs, in metres (`waveField`'s height).
 */
export function wavesGlsl(cfg: WaterConfig): string {
  const trains = waveSet(cfg);
  const lines = trains.map(
    (w) =>
      `seaWave(p, t, px, py, vec2(${float(w.dx)}, ${float(w.dz)}), ${float(w.length)}, ${float(w.height)}, ${float(w.k)}, ${float(w.omega)}, ` +
      `${float(w.patch)}, ${float(w.patchSpeed)}, vec2(${float(w.ox)}, ${float(w.oz)}), ${float(w.phase)}, slope, lost, rise);`,
  );
  return /* glsl */ `
    uint seaScramble(uint n) {
      n ^= n >> 15u;
      n *= 2246822519u;
      n ^= n >> 13u;
      n *= 3266489917u;
      n ^= n >> 16u;
      return n;
    }
    vec3 seaCell(ivec2 c) {
      uint a = seaScramble(uint(c.x) * 374761393u + uint(c.y) * 668265263u);
      uint b = seaScramble(a + 2654435769u);
      uint e = seaScramble(b + 2654435769u);
      return vec3(float(a), float(b), float(e)) / 4294967295.0;
    }
    vec3 seaPatch(vec2 q) {
      vec2 i = floor(q);
      vec2 f = q - i;
      f = f * f * (3.0 - 2.0 * f);
      ivec2 c = ivec2(i);
      return mix(mix(seaCell(c), seaCell(c + ivec2(1, 0)), f.x), mix(seaCell(c + ivec2(0, 1)), seaCell(c + ivec2(1, 1)), f.x), f.y);
    }
    void seaWave(vec2 p, float t, vec2 px, vec2 py, vec2 d, float len, float height, float k, float omega,
                 float patchSize, float patchSpeed, vec2 offset, float phase, inout vec2 slope, inout float lost, inout float rise) {
      float footprint = max(abs(dot(px, d)), abs(dot(py, d)));
      float keep = 1.0 - smoothstep(${float(cfg.resolve[0])}, ${float(cfg.resolve[1])}, footprint / len);
      float usual = height * k;
      lost += usual * usual * (1.0 - keep * keep);
      if (keep <= 0.0) return;
      vec3 n = seaPatch((p - d * patchSpeed * t) / patchSize + offset);
      vec2 q = p + ${float(cfg.bend)} * len * (2.0 * n.xy - 1.0);
      float gain = mix(${float(cfg.groups.gain[0])}, ${float(cfg.groups.gain[1])}, smoothstep(0.25, 0.75, n.z));
      float theta = k * dot(d, q) - omega * t + phase;
      float up = 0.5 + 0.5 * sin(theta);
      float shape = pow(up, ${float(cfg.crest - 1)});
      float tall = keep * height * gain;
      rise += tall * shape * up;
      slope += d * (tall * k * ${float(cfg.crest * 0.5)} * shape * cos(theta));
    }
    vec2 seaSlope(vec2 p, float t, vec2 px, vec2 py, out float lost, out float rise) {
      vec2 slope = vec2(0.0);
      lost = 0.0;
      rise = 0.0;
      ${lines.join('\n      ')}
      return slope;
    }
  `;
}
