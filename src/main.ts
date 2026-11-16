import { config } from './config';
import { choosePage } from './app/route';
import type { DriveHandle, ViewHandle } from './app/worldPage';
import { mountTrackLab } from './debug/trackLab/lab';
import { mountContactSheet } from './debug/trackLab/sheet';
import { hashTrack, hashWorld } from './gen';
import { genClient } from './worker/client';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app element');

// The 3D world is the page; the track lab (?lab=1, or L) and contact sheets are debug views.
const page = choosePage(new URL(window.location.href).searchParams);
if (page.kind === 'world') {
  // Loaded only when shown, so the lab and the contact sheets do not have to download Three.js.
  void import('./app/worldPage').then(({ mountWorldPage }) => {
    const view = mountWorldPage(app);
    window.seedCircuit.view = view;
    window.seedCircuit.drive = view.drive;
  });
} else if (page.kind === 'sheet') {
  mountContactSheet(app, page.seeds, page.run);
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
      /** The fingerprint of the physics drop proof on a seed (`sim/physics/proof.ts`), to confirm every browser's physics agrees. */
      physicsHashFor(seed: number): Promise<string>;
      /** The fingerprint of the scripted run on a seed (`sim/script.ts`), to confirm every browser's simulation agrees. */
      simHashFor(seed: number): Promise<string>;
      /** The 3D view, when that is the page being shown. */
      view?: ViewHandle;
      /** The simulation of the island on the 3D page, when that is the page being shown. */
      drive?: DriveHandle;
    };
  }
}
window.seedCircuit = {
  hashFor: async (seed) => hashTrack((await genClient().track(seed, config)).result),
  worldHashFor: async (seed) => hashWorld((await genClient().world(seed, config)).result),
  physicsHashFor: async (seed) => {
    // Loaded only when asked for, so the lab does not have to download the physics engine.
    const [{ loadRapier }, { dropFingerprint }, { result }] = await Promise.all([
      import('./sim/physics/rapier'),
      import('./sim/physics/proof'),
      genClient().world(seed, config),
    ]);
    return dropFingerprint(await loadRapier(), result);
  },
  simHashFor: async (seed) => {
    const [{ loadRapier }, { scriptedFingerprint }, { result }] = await Promise.all([
      import('./sim/physics/rapier'),
      import('./sim/script'),
      genClient().world(seed, config),
    ]);
    return scriptedFingerprint(await loadRapier(), result, config);
  },
};
