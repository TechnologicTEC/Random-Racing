import { mountTrackLab } from './debug/trackLab/lab';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app element');

// Milestone 1: the whole page is the track lab. From Milestone 2 the game
// lives here and the lab becomes a debug overlay.
mountTrackLab(app);
