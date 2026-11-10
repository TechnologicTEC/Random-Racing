import { describe, expect, it } from 'vitest';
import { findViolations } from './testing/architectureRules';

// Every non-test source file in the pure layers, loaded as text by Vite.
const allPureFiles = import.meta.glob<string>(['./core/**/*.ts', './gen/**/*.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const pureSources = Object.fromEntries(
  Object.entries(allPureFiles).filter(([path]) => !path.endsWith('.test.ts')),
);

describe('architecture rules for src/core and src/gen', () => {
  it('finds the pure source files', () => {
    expect(Object.keys(pureSources).length).toBeGreaterThan(0);
  });

  it.each(Object.entries(pureSources))('%s follows the rules', (path, source) => {
    expect(findViolations(path, source)).toEqual([]);
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
