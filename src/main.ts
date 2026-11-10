import { mountTrackLab } from './debug/trackLab/lab';
import { mountContactSheet } from './debug/trackLab/sheet';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app element');

// Milestone 1: the whole page is the track lab. From Milestone 2 the game
// lives here and the lab becomes a debug overlay.
const params = new URL(window.location.href).searchParams;
const sheet = Number(params.get('sheet'));
if (Number.isInteger(sheet) && sheet > 0) {
  const from = Number(params.get('from') ?? '1');
  mountContactSheet(app, Number.isInteger(from) && from >= 0 ? from : 1, Math.min(sheet, 100));
} else {
  mountTrackLab(app);
}
