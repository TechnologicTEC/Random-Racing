import { describe, expect, it } from 'vitest';
import { config, type CharacterConfig } from '../config';
import { createHasher } from '../core/hash';
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
    expect(Object.keys(character).sort()).toEqual(['coast', 'landform', 'mountains', 'relief', 'route', 'width']);
  });

  it('leaves the traits drawn before landform and route exactly as they were on seeds 1 to 2000', () => {
    // Fingerprint of relief, coast, width and mountain count, taken before landform and route were added.
    const hasher = createHasher();
    for (const c of all) hasher.text(c.relief).text(c.coast).text(c.width).numbers([c.mountains]);
    expect(hasher.digest()).toBe('79af4bd2');
  });

  it('picks each mountain shape at about its weight over 2000 seeds', () => {
    for (const landform of ['range', 'hills', 'peak'] as const) {
      expect(Math.abs(share(all, (c) => c.landform === landform) - cfg.landform[landform]), landform).toBeLessThan(0.04);
    }
  });

  it('gives mountain seeds a route, climbing or circling at about their weights, and no other seed one', () => {
    const mountains = all.filter((c) => c.relief === 'mountain');
    expect(mountains.length).toBeGreaterThan(300);
    for (const route of ['climb', 'circle'] as const) {
      expect(Math.abs(share(mountains, (c) => c.route === route) - cfg.route[route]), route).toBeLessThan(0.06);
    }
    for (const character of all) {
      if (character.relief !== 'mountain') expect(character.route).toBeNull();
    }
  });

  it('draws the mountain shape independently of the relief', () => {
    for (const relief of ['flat', 'rolling', 'hilly', 'mountain'] as const) {
      const some = all.filter((c) => c.relief === relief);
      for (const landform of ['range', 'hills', 'peak'] as const) {
        expect(Math.abs(share(some, (c) => c.landform === landform) - cfg.landform[landform]), `${landform} when ${relief}`).toBeLessThan(0.08);
      }
    }
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
    const onlyRanges: CharacterConfig = { ...cfg, landform: { range: 1, hills: 0, peak: 0 }, route: { climb: 0, circle: 1 } };
    for (const seed of seeds.slice(0, 200)) {
      const before = pickCharacter(seed, cfg);
      const after = pickCharacter(seed, moreCoast);
      expect(after.relief).toBe(before.relief);
      expect(after.width).toBe(before.width);
      expect(after.mountains).toBe(before.mountains);
      expect(after.landform).toBe(before.landform);
      expect(after.route).toBe(before.route);
      const shaped = pickCharacter(seed, onlyRanges);
      expect(shaped.landform).toBe('range');
      expect(shaped.route).toBe(shaped.relief === 'mountain' ? 'circle' : null);
      expect({ ...shaped, landform: before.landform, route: before.route }).toEqual(before);
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
    const landform = result.character.landform === 'range' ? 'hills' : 'range';
    expect(hashTrack({ ...result, character: { ...result.character, landform } })).not.toBe(hashTrack(result));
    const climbing = hashTrack({ ...result, character: { ...result.character, route: 'climb' } });
    expect(hashTrack({ ...result, character: { ...result.character, route: 'circle' } })).not.toBe(climbing);
  });
});
