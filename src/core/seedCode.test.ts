import { describe, expect, it } from 'vitest';
import { formatSeedCode, MAX_SEED, parseSeedInput, seedInputProblem } from './seedCode';

describe('seedInputProblem (M4.5)', () => {
  it.each(['48213', 'v0-48213', '  V0-12 ', '0', '4294967295', 'v00-7'])('finds nothing wrong with %j', (text) => {
    expect(seedInputProblem(text, 0)).toBeNull();
  });

  it.each(['', '   '])('asks for a seed when nothing is typed (%j)', (text) => {
    expect(seedInputProblem(text, 0)).toMatch(/^Type a seed/);
  });

  it.each(['abc', '1.5', '12 34', '1e3', 'v-3', 'v1-', 'v0-abc', 'seed 7'])('says %j is not a seed', (text) => {
    expect(seedInputProblem(text, 0)).toMatch(/^Not a seed/);
  });

  it.each(['4294967296', '99999999999', '-5', 'v0-4294967296'])('says %j is out of range', (text) => {
    expect(seedInputProblem(text, 0)).toBe(`Seeds go from 0 to ${MAX_SEED}.`);
  });

  it('says a code from another generator version would give another island, and how to see the seed with this one', () => {
    const problem = seedInputProblem('v1-48213', 0);
    expect(problem).toMatch(/v1/);
    expect(problem).toMatch(/v0/);
    expect(problem).toMatch(/48213 alone/);
    expect(seedInputProblem('v12345-9', 0)).toMatch(/v12345/);
    expect(seedInputProblem('v0-9', 3)).toMatch(/v3/);
  });

  it('finds a problem exactly when the text does not read as a seed of this version', () => {
    const texts = ['', '7', 'v0-7', 'v1-7', 'x', '-1', '4294967296', 'v0-', ' 12 ', 'V0-5', 'v9999-1', 'v10000-1'];
    for (const text of texts) {
      const parsed = parseSeedInput(text);
      const fine = parsed !== null && (parsed.version === null || parsed.version === 0);
      expect(seedInputProblem(text, 0) === null, text).toBe(fine);
    }
  });
});

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
