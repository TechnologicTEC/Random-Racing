import type { Rng } from '../../core/rng';

const STARTS = [
  'Mar', 'Ost', 'Vel', 'Cor', 'Tal', 'Bri', 'Sel', 'Wyn', 'Ard', 'Lum',
  'Fen', 'Hal', 'Kes', 'Orn', 'Thal', 'Ise', 'Dun', 'Pel', 'Ro', 'Sky',
];
const ENDS = [
  'holm', 'wick', 'rey', 'mere', 'dun', 'ara', 'sey', 'ock', 'ven', 'ith',
  'andra', 'gard', 'stead', 'more',
];
const KINDS = ['Circuit', 'Ring', 'Raceway', 'Speedway', 'Loop', 'Park', 'Run', 'Grand Prix'];

/** A made-up place plus a kind of track, such as "Velwick Raceway". */
export function generateTrackName(rng: Rng): string {
  return `${rng.pick(STARTS)}${rng.pick(ENDS)} ${rng.pick(KINDS)}`;
}
