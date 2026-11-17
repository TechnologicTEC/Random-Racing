// Takes the visual bar's reference pictures again (6h-3), at the addresses in docs/VISUAL_BAR.md, into docs/visual-bar/.
// Run from the repo folder with `npm run dev` running: node scripts/visual-bar-pictures.mjs (or name some: ... shore.jpg,mountain.jpg)
import { chromium, devices } from '@playwright/test';

const REFS = [
  ['road-morning-shadows.jpg', 'seed=7&still=1&cam=fly&lap=0.3'],
  ['road-straight-meadow.jpg', 'seed=8&still=1&cam=fly&lap=0.3'],
  ['road-corner-kerb.jpg', 'seed=1&still=1&cam=fly&lap=0.55'],
  ['road-corner-woods.jpg', 'seed=2024&still=1&cam=fly&lap=0.3&time=18:30'],
  ['start-gate.jpg', 'seed=42&still=1&look=start'],
  ['hairpin-and-beach.jpg', 'seed=100&still=1&look=hairpin'],
  ['shore.jpg', 'seed=7&still=1&look=water'],
  ['mountain-road.jpg', 'seed=1&still=1&look=climb'],
  ['mountain.jpg', 'seed=1&still=1&look=summit'],
  ['island-from-above.jpg', 'seed=2024&still=1&cam=orbit'],
  ['sunrise.jpg', 'seed=7&still=1&look=sun&time=07:00'],
  ['drive-start.jpg', 'seed=42&still=1', true],
  ['car-close.jpg', 'seed=42&still=1&look=car', true],
];

const only = process.argv[2] ? process.argv[2].split(',') : null;
const browser = await chromium.launch();
const page = await browser.newPage({ ...devices['Desktop Chrome'] });
for (const [file, query, car] of REFS) {
  if (only && !only.includes(file)) continue;
  await page.goto(`http://127.0.0.1:5173/?${query}`);
  await page.waitForFunction(() => document.body.dataset.worldReady === 'true', null, { timeout: 120_000 });
  if (car) await page.waitForFunction(() => document.body.dataset.driveCar === 'shown', null, { timeout: 60_000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `docs/visual-bar/${file}`, type: 'jpeg', quality: 85 });
  console.log(`took ${file}`);
}
await browser.close();
