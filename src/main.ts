import { GENERATOR_VERSION } from './config';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app element');

app.textContent = `Seed Circuit track lab (generator v${GENERATOR_VERSION})`;
