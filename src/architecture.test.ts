import { describe, expect, it } from 'vitest';
import { findViolations, importsRapier, importsThree } from './testing/architectureRules';

// Every non-test source file in the pure layers, loaded as text by Vite.
const allPureFiles = import.meta.glob<string>(['./core/**/*.ts', './gen/**/*.ts', './sim/**/*.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const pureSources = Object.fromEntries(
  Object.entries(allPureFiles).filter(([path]) => !path.endsWith('.test.ts')),
);

describe('architecture rules for src/core, src/gen and src/sim', () => {
  it('finds the pure source files', () => {
    expect(Object.keys(pureSources).length).toBeGreaterThan(0);
    expect(Object.keys(pureSources).some((path) => path.startsWith('./sim/'))).toBe(true);
  });

  it.each(Object.entries(pureSources))('%s follows the rules', (path, source) => {
    expect(findViolations(path, source)).toEqual([]);
  });
});

// Every non-test source file, to check where Three.js is used.
const allFiles = import.meta.glob<string>('./**/*.ts', { query: '?raw', import: 'default', eager: true });

describe('Three.js stays in src/render', () => {
  const outsideRender = Object.entries(allFiles).filter(
    ([path]) => !path.startsWith('./render/') && !path.endsWith('.test.ts') && !path.startsWith('./testing/'),
  );

  it('finds source files to check', () => {
    expect(outsideRender.length).toBeGreaterThan(20);
  });

  it.each(outsideRender)('%s does not import three', (_path, source) => {
    expect(importsThree(source)).toBe(false);
  });

  it('recognises every way of importing three', () => {
    expect(importsThree(`import * as THREE from 'three';`)).toBe(true);
    expect(importsThree(`import { Vector3 } from "three";`)).toBe(true);
    expect(importsThree(`import type { Mesh } from 'three';`)).toBe(true);
    expect(importsThree(`import { OrbitControls } from 'three/addons/controls/OrbitControls.js';`)).toBe(true);
    expect(importsThree(`const three = await import('three');`)).toBe(true);
    expect(importsThree(`// import * as THREE from 'three';
export const x = 1;`)).toBe(false);
    expect(importsThree(`import { thing } from './three-quarters';`)).toBe(false);
  });
});

describe('Rapier stays in src/sim/physics', () => {
  const outsidePhysics = Object.entries(allFiles).filter(([path]) => !path.startsWith('./sim/physics/') && !path.endsWith('.test.ts'));

  it('finds source files to check', () => {
    expect(outsidePhysics.length).toBeGreaterThan(20);
  });

  it.each(outsidePhysics)('%s does not import Rapier', (_path, source) => {
    expect(importsRapier(source)).toBe(false);
  });

  it('recognises every way of importing Rapier', () => {
    expect(importsRapier(`import RAPIER from '@dimforge/rapier3d-deterministic-compat';`)).toBe(true);
    expect(importsRapier(`import type { World } from "@dimforge/rapier3d-compat";`)).toBe(true);
    expect(importsRapier(`const rapier = await import('@dimforge/rapier3d-deterministic-compat');`)).toBe(true);
    expect(importsRapier(`// import RAPIER from '@dimforge/rapier3d-deterministic-compat';
export const x = 1;`)).toBe(false);
    expect(importsRapier(`import { loadRapier } from './physics/rapier';`)).toBe(false);
  });
});

describe('findViolations in src/sim', () => {
  it('lets the simulation use core, generation and itself', () => {
    const source = `import { dsin } from '../core/dmath';
import type { WorldResult } from '../gen/types';
import { stepCar } from './car/drive';
export const x = dsin(1);`;
    expect(findViolations('./sim/sim.ts', source)).toEqual([]);
  });

  it('stops the simulation importing the page, the drawing, the input devices or the camera', () => {
    expect(findViolations('./sim/sim.ts', `import { draw } from '../render/carView';`)).toHaveLength(1);
    expect(findViolations('./sim/sim.ts', `import { mount } from '../app/drive';`)).toHaveLength(1);
    expect(findViolations('./sim/car/steer.ts', `import { keys } from '../../input/keyboard';`)).toHaveLength(1);
    expect(findViolations('./sim/sim.ts', `import { chase } from '../camera/chase';`)).toHaveLength(1);
  });

  it('stops the simulation reading config values directly, but allows config types', () => {
    expect(findViolations('./sim/sim.ts', `import { config } from '../config';`)).toHaveLength(1);
    expect(findViolations('./sim/sim.ts', `import type { SimConfig } from '../config';`)).toEqual([]);
  });

  it('catches chance, the clock and inexact maths in the simulation', () => {
    expect(findViolations('./sim/sim.ts', 'const r = Math.random();')).toHaveLength(1);
    expect(findViolations('./sim/sim.ts', 'const t = performance.now();')).toHaveLength(1);
    expect(findViolations('./sim/car/steer.ts', 'const v = Math.sin(1);')).toHaveLength(1);
    expect(findViolations('./sim/physics/carBody.ts', 'const v = Math.atan2(1, 2);')).toHaveLength(1);
  });

  it('lets only src/sim/physics import Rapier', () => {
    const source = `import RAPIER from '@dimforge/rapier3d-deterministic-compat';`;
    expect(findViolations('./sim/physics/rapier.ts', source)).toEqual([]);
    expect(findViolations('./sim/sim.ts', source)).toHaveLength(1);
    expect(findViolations('./sim/car/drive.ts', source)).toHaveLength(1);
    expect(findViolations('./gen/a.ts', source)).toHaveLength(1);
  });

  it('never lets the simulation import Three.js, the physics folder included', () => {
    expect(findViolations('./sim/sim.ts', `import { Vector3 } from 'three';`)).toHaveLength(1);
    expect(findViolations('./sim/physics/colliders.ts', `import { Vector3 } from 'three';`)).toHaveLength(1);
  });
});

describe('findViolations', () => {
  it('accepts clean generation code', () => {
    const source = `import { createRng } from '../../core/rng';\nexport const x = createRng(1, 'track').next();`;
    expect(findViolations('./gen/track/layout.ts', source)).toEqual([]);
  });

  it('catches Math.random', () => {
    expect(findViolations('./gen/track/layout.ts', 'const r = Math.random();')).toEqual([
      'uses Math.random (use the seeded generator)',
    ]);
  });

  it('catches clock reads', () => {
    expect(findViolations('./gen/a.ts', 'const t = Date.now();')).toHaveLength(1);
    expect(findViolations('./gen/a.ts', 'const t = new Date();')).toHaveLength(1);
    expect(findViolations('./gen/a.ts', 'const t = performance.now();')).toHaveLength(1);
  });

  it.each(['sin', 'cos', 'tan', 'atan2', 'acos', 'hypot', 'pow', 'exp', 'log', 'cbrt'])(
    'catches Math.%s, which can differ between browsers',
    (name) => {
      expect(findViolations('./gen/a.ts', `const v = Math.${name}(1);`)).toEqual([
        `uses Math.${name}, which can differ between browsers (see core/dmath.ts)`,
      ]);
    },
  );

  it('allows the Math functions that are exact everywhere', () => {
    const source = 'const v = Math.sqrt(Math.abs(Math.floor(Math.min(1, Math.max(2, Math.round(3.5))))));';
    expect(findViolations('./gen/a.ts', source)).toEqual([]);
  });

  it('catches Three.js and Rapier imports', () => {
    expect(findViolations('./gen/a.ts', `import * as THREE from 'three';`)).toHaveLength(1);
    expect(findViolations('./gen/a.ts', `import { Vector3 } from "three/src/math/Vector3.js";`)).toHaveLength(1);
    expect(findViolations('./gen/a.ts', `import R from '@dimforge/rapier3d-compat';`)).toHaveLength(1);
  });

  it('catches imports from outer layers', () => {
    expect(findViolations('./gen/a.ts', `import { draw } from '../render/draw';`)).toHaveLength(1);
    expect(findViolations('./gen/track/a.ts', `import { lab } from '../../debug/trackLab/lab';`)).toHaveLength(1);
    expect(findViolations('./gen/a.ts', `import { step } from '../sim/step';`)).toHaveLength(1);
  });

  it('stops core importing from gen or the config file', () => {
    expect(findViolations('./core/a.ts', `import { generateTrack } from '../gen';`)).toHaveLength(1);
    expect(findViolations('./core/a.ts', `import { config } from '../config';`)).toHaveLength(1);
  });

  it('stops gen reading config values directly, but allows config types', () => {
    expect(findViolations('./gen/a.ts', `import { config } from '../config';`)).toHaveLength(1);
    expect(findViolations('./gen/a.ts', `import type { TrackConfig } from '../config';`)).toEqual([]);
  });

  it('ignores forbidden words inside comments', () => {
    const source = `// never use Math.random here\n/* nor Date.now() */\nexport const x = 1;`;
    expect(findViolations('./gen/a.ts', source)).toEqual([]);
  });
});
