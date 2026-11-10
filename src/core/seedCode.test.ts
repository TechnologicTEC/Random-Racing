import { describe, expect, it } from 'vitest';
import { formatSeedCode, MAX_SEED, parseSeedInput } from './seedCode';

describe('formatSeedCode', () => {
  it('combines version and seed like the brief example', () => {
    expect(formatSeedCode(48213, 1)).toBe('v1-48213');
    expect(formatSeedCode(7, 0)).toBe('v0-7');
  });
});

describe('parseSeedInput', () => {
  it('reads a plain number', () => {
    expect(parseSeedInput('48213')).toEqual({ seed: 48213, version: null });
  });

  it('reads a share code', () => {
    expect(parseSeedInput('v1-48213')).toEqual({ seed: 48213, version: 1 });
  });

  it('ignores surrounding spaces and letter case', () => {
    expect(parseSeedInput('  V0-12 ')).toEqual({ seed: 12, version: 0 });
  });

  it('round-trips with formatSeedCode', () => {
    expect(parseSeedInput(formatSeedCode(MAX_SEED, 3))).toEqual({ seed: MAX_SEED, version: 3 });
  });

  it('accepts zero and the largest seed', () => {
    expect(parseSeedInput('0')).toEqual({ seed: 0, version: null });
    expect(parseSeedInput('4294967295')).toEqual({ seed: 4294967295, version: null });
  });

  it.each(['', '   ', 'abc', '-5', '1.5', '4294967296', 'v-3', 'v1-', 'v1-abc', '12 34', '1e3'])(
    'rejects %j',
    (text) => {
      expect(parseSeedInput(text)).toBeNull();
    },
  );
});
