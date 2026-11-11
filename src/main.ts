import { config } from './config';
import { parseSeedInput } from './core/seedCode';
import type { ViewHandle } from './app/worldPage';
import { mountTrackLab } from './debug/trackLab/lab';
import { mountContactSheet } from './debug/trackLab/sheet';
import { hashTrack, hashWorld } from './gen';
import { genClient } from './worker/client';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app element');

// Milestone 1: the whole page is the track lab. From Milestone 2 the game
// lives here and the lab becomes a debug overlay.
const params = new URL(window.location.href).searchParams;
const sheet = Number(params.get('sheet'));
const listed = (params.get('seeds') ?? '')
  .split(',')
  .map((text) => parseSeedInput(text)?.seed)
  .filter((seed): seed is number => seed !== undefined)
  .slice(0, 100);
if (params.get('view') === '3d') {
  // The 3D world. It becomes the default page later in Milestone 2. Loaded
  // only when asked for, so the lab does not have to download Three.js.
  void import('./app/worldPage').then(({ mountWorldPage }) => {
    window.seedCircuit.view = mountWorldPage(app);
  });
} else if (listed.length > 0) {
  mountContactSheet(app, listed, null);
} else if (Number.isInteger(sheet) && sheet > 0) {
  const fromParam = Number(params.get('from') ?? '1');
  const from = Number.isInteger(fromParam) && fromParam >= 0 ? fromParam : 1;
  const count = Math.min(sheet, 100);
  mountContactSheet(app, Array.from({ length: count }, (_, i) => from + i), { from, count });
} else {
  mountTrackLab(app);
}

// Lets automated checks ask this browser for a track fingerprint, to confirm
// every browser generates exactly the same track for a seed.
declare global {
  interface Window {
    seedCircuit: {
      hashFor(seed: number): Promise<string>;
      worldHashFor(seed: number): Promise<string>;
      /** The 3D view, when that is the page being shown. */
      view?: ViewHandle;
    };
  }
}
window.seedCircuit = {
  hashFor: async (seed) => hashTrack((await genClient().track(seed, config)).result),
  worldHashFor: async (seed) => hashWorld((await genClient().world(seed, config)).result),
};
