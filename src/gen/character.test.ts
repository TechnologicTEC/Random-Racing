import { describe, expect, it } from 'vitest';
import { config, type CharacterConfig } from '../config';
import { withCharacter } from '../testing/characters';
import { pickCharacter } from './character';
import { hashTrack } from './track/hash';
import { generateTrack } from './track/pipeline';
import type { Character } from './types';

const cfg = config.world.character;
const seeds = Array.from({ length: 2000 }, (_, i) => i + 1);
const all = seeds.map((seed) => pickCharacter(seed, cfg));

/** Share of the list for which the test holds, 0 to 1. */
const share = (list: readonly Character[], test: (c: Character) => boolean): number =>
  list.filter(test).length / list.length;

describe('pickCharacter', () => {
  it('gives the same seed the same character every time', () => {
    for (const seed of [0, 1, 42, 48213, 4294967295]) {
      expect(pickCharacter(seed, cfg)).toEqual(pickCharacter(seed, cfg));
    }
  });

  it('is plain data', () => {
    const character = pickCharacter(7, cfg);
    expect(structuredClone(character)).toEqual(character);
    expect(Object.keys(character).sort()).toEqual(['coast', 'mountains', 'relief', 'width']);
  });

  it('gives different seeds different characters', () => {
    const kinds = new Set(all.map((c) => `${c.relief}/${c.coast}/${c.mountains}/${c.width}`));
    // 4 reliefs x 3 coasts x 2 widths x several mountain counts: most combinations should turn up.
    expect(kinds.size).toBeGreaterThan(60);
  });

  it('picks each relief at about its weight over 2000 seeds', () => {
    for (const relief of ['flat', 'rolling', 'hilly', 'mountain'] as const) {
      expect(Math.abs(share(all, (c) => c.relief === relief) - cfg.relief[relief]), relief).toBeLessThan(0.04);
    }
  });

  it('picks each coast at about its weight over 2000 seeds', () => {
    for (const coast of ['inland', 'touches', 'coastal'] as const) {
      expect(Math.abs(share(all, (c) => c.coast === coast) - cfg.coast[coast]), coast).toBeLessThan(0.04);
    }
  });

  it('picks varied and constant road width at about their weights', () => {
    for (const width of ['constant', 'varied'] as const) {
      expect(Math.abs(share(all, (c) => c.width === width) - cfg.width[width]), width).toBeLessThan(0.04);
    }
  });

  it('gives 0 to 4 mountains: flat seeds none or one, mountain seeds at least one', () => {
    for (const character of all) {
      expect(Number.isInteger(character.mountains)).toBe(true);
      expect(character.mountains).toBeGreaterThanOrEqual(0);
      expect(character.mountains).toBeLessThanOrEqual(4);
      if (character.relief === 'flat') expect(character.mountains).toBeLessThanOrEqual(1);
      if (character.relief === 'mountain') expect(character.mountains).toBeGreaterThanOrEqual(1);
    }
    expect(new Set(all.map((c) => c.mountains)).size).toBe(5);
  });

  it('draws the traits independently, so they combine differently from seed to seed', () => {
    // Whatever the coast, the reliefs turn up in about the same shares; and the same the other way round.
    for (const coast of ['inland', 'touches', 'coastal'] as const) {
      const some = all.filter((c) => c.coast === coast);
      for (const relief of ['flat', 'rolling', 'hilly', 'mountain'] as const) {
        expect(Math.abs(share(some, (c) => c.relief === relief) - cfg.relief[relief]), `${relief} when ${coast}`).toBeLessThan(0.08);
      }
      expect(Math.abs(share(some, (c) => c.width === 'varied') - cfg.width.varied), `varied when ${coast}`).toBeLessThan(0.08);
    }
  });

  it('follows the weights it is given', () => {
    const onlyFlat: CharacterConfig = {
      ...cfg,
      relief: { flat: 1, rolling: 0, hilly: 0, mountain: 0 },
      coast: { inland: 0, touches: 0, coastal: 1 },
      width: { constant: 1, varied: 0 },
    };
    for (const seed of seeds.slice(0, 200)) {
      const character = pickCharacter(seed, onlyFlat);
      expect(character.relief).toBe('flat');
      expect(character.coast).toBe('coastal');
      expect(character.width).toBe('constant');
    }
  });

  it('keeps one trait the same when the weights of another change', () => {
    const moreCoast: CharacterConfig = { ...cfg, coast: { inland: 0, touches: 0, coastal: 1 } };
    for (const seed of seeds.slice(0, 200)) {
      const before = pickCharacter(seed, cfg);
      const after = pickCharacter(seed, moreCoast);
      expect(after.relief).toBe(before.relief);
      expect(after.width).toBe(before.width);
      expect(after.mountains).toBe(before.mountains);
    }
  });
});

describe('the character of a generated track', () => {
  const result = generateTrack(48213, config);

  it('is recorded on the track result', () => {
    expect(result.character).toEqual(pickCharacter(48213, cfg));
  });

  it('decides the ground the track is laid over: a mountain seed climbs far more than a flat one', () => {
    const rangeOf = (relief: 'flat' | 'mountain'): number => {
      const track = generateTrack(48213, withCharacter(config, { relief }));
      const { height } = track.candidates[track.winnerIndex]!.profile;
      return Math.max(...height) - Math.min(...height);
    };
    expect(rangeOf('flat')).toBeLessThan(8);
    expect(rangeOf('mountain')).toBeGreaterThan(40);
  });

  it('is part of the track fingerprint', () => {
    const other: Character = { ...result.character, mountains: result.character.mountains === 0 ? 1 : 0 };
    expect(hashTrack({ ...result, character: other })).not.toBe(hashTrack(result));
    const coast = result.character.coast === 'inland' ? 'coastal' : 'inland';
    expect(hashTrack({ ...result, character: { ...result.character, coast } })).not.toBe(hashTrack(result));
  });
});
