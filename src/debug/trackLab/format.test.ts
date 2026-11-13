import { describe, expect, it } from 'vitest';
import type { ScorePart } from '../../gen/types';
import { config } from '../../config';
import { generateTrack } from '../../gen';
import { describeCharacter, describeFit, describeWidth, describeProfile, describeScorePart, describeViolation, shortCharacter, summariseTracks } from './format';

describe('describeCharacter', () => {
  it('lists the traits of a seed in plain words', () => {
    expect(describeCharacter({ relief: 'mountain', coast: 'touches', mountains: 3, width: 'varied', landform: 'range', route: 'climb' })).toEqual([
      ['Relief', 'Mountain'],
      ['Route', 'Climbs high onto its mountain'],
      ['Coast', 'Touches the sea in places'],
      ['Mountains', '3'],
      ['Mountain shape', 'Ridged range'],
      ['Road width', 'Varied'],
    ]);
    expect(describeCharacter({ relief: 'flat', coast: 'inland', mountains: 0, width: 'constant', landform: 'hills', route: null })).toEqual([
      ['Relief', 'Flat'],
      ['Coast', 'Inland: never beside the sea'],
      ['Mountains', 'None'],
      ['Mountain shape', 'Rolling hill country'],
      ['Road width', 'Constant'],
    ]);
    expect(describeCharacter({ relief: 'hilly', coast: 'coastal', mountains: 1, width: 'constant', landform: 'peak', route: null })[1]).toEqual([
      'Coast',
      'Coastal: mostly beside the sea',
    ]);
    expect(describeCharacter({ relief: 'mountain', coast: 'inland', mountains: 1, width: 'constant', landform: 'peak', route: 'circle' })).toContainEqual([
      'Route',
      'Circles its mountain',
    ]);
    expect(describeCharacter({ relief: 'hilly', coast: 'inland', mountains: 1, width: 'constant', landform: 'peak', route: null })).toContainEqual([
      'Mountain shape',
      'Lone peak',
    ]);
  });
});

describe('describeWidth', () => {
  it('gives one width for a road that never changes', () => {
    expect(describeWidth(new Float64Array([12, 12, 12]))).toBe('12 m all the way round');
  });

  it('gives the narrowest and widest for a road that does, and how much of the lap is wider', () => {
    // Four samples, two of them clearly wider than the narrowest.
    expect(describeWidth(new Float64Array([12, 12, 17.4, 21.6]))).toBe('12 to 22 m (wider on 50% of the lap)');
  });
});

describe('shortCharacter', () => {
  it('fits the traits into a few words for a contact sheet caption', () => {
    expect(shortCharacter({ relief: 'mountain', coast: 'touches', mountains: 3, width: 'varied', landform: 'range', route: 'climb' })).toBe(
      'mountain, climbing · touches · 3 mountains, ridged range · varied width',
    );
    expect(shortCharacter({ relief: 'mountain', coast: 'inland', mountains: 1, width: 'constant', landform: 'hills', route: 'circle' })).toBe(
      'mountain, circling · inland · 1 mountain, hill country',
    );
    expect(shortCharacter({ relief: 'flat', coast: 'inland', mountains: 1, width: 'constant', landform: 'peak', route: null })).toBe(
      'flat · inland · 1 mountain, lone peak',
    );
    // With no mountains the shape has nothing to describe.
    expect(shortCharacter({ relief: 'rolling', coast: 'coastal', mountains: 0, width: 'constant', landform: 'range', route: null })).toBe('rolling · coastal');
  });
});

describe('describeViolation', () => {
  it('explains each kind of rejection in plain words with the numbers', () => {
    expect(describeViolation({ kind: 'self-intersection', x: 0, z: 0, value: 0, limit: 0 })).toBe('Crosses itself');
    expect(describeViolation({ kind: 'corner-too-tight', x: 0, z: 0, value: 11.4, limit: 15 })).toBe(
      'Corner too tight: 11 m radius (minimum 15 m)',
    );
    expect(describeViolation({ kind: 'sections-too-close', x: 0, z: 0, value: 20.2, limit: 32.5 })).toBe(
      'Sections too close: 20 m apart (minimum 32.5 m)',
    );
    expect(describeViolation({ kind: 'lap-too-short', x: 0, z: 0, value: 1250.4, limit: 1400 })).toBe(
      'Lap too short: 1250 m (minimum 1400 m)',
    );
    expect(describeViolation({ kind: 'lap-too-long', x: 0, z: 0, value: 2600, limit: 2400 })).toBe(
      'Lap too long: 2600 m (maximum 2400 m)',
    );
    expect(describeViolation({ kind: 'out-of-bounds', x: 0, z: 0, value: 520.3, limit: 500 })).toBe(
      'Leaves the buildable area: 520 m from the centre (maximum 500 m)',
    );
    expect(describeViolation({ kind: 'cut-too-deep', x: 0, z: 0, value: 11.62, limit: 8 })).toBe(
      'Cutting too deep: 11.6 m (maximum 8 m)',
    );
    expect(describeViolation({ kind: 'fill-too-high', x: 0, z: 0, value: 7.04, limit: 6 })).toBe(
      'Embankment too high: 7 m (maximum 6 m)',
    );
    expect(describeViolation({ kind: 'bank-too-steep', x: 0, z: 0, value: 0.613, limit: 0.47 })).toBe(
      'Bank between sections too steep: 61% (maximum 47%)',
    );
  });
});

describe('describeScorePart', () => {
  const part = (key: ScorePart['key'], facts: Record<string, number>, pending = false): ScorePart => ({
    key, score: 0.5, weight: 0.25, pending, facts,
  });

  it('names each part and shows the numbers behind it', () => {
    expect(describeScorePart(part('straights', { longest: 212.4, second: 149.6, longCount: 1 }))).toEqual({
      label: 'Long straights',
      detail: 'Longest 212 m and 150 m; 1 over 150 m',
    });
    expect(describeScorePart(part('cornerMix', { hairpins: 1, sweepers: 2, chicanes: 0 }))).toEqual({
      label: 'Corner mix',
      detail: '1 hairpin, 2 sweepers, 0 chicanes',
    });
    expect(describeScorePart(part('drift', { driftCorners: 4, corners: 9, target: 5 }))).toEqual({
      label: 'Drift corners',
      detail: '4 of 9 corners suit drifting; best is 5 or more, and most of them',
    });
    expect(describeScorePart(part('flow', { corners: 9, kinks: 1, left: 3, right: 6, stutters: 0 }))).toEqual({
      label: 'Flow',
      detail: '9 corners (3 left, 6 right), 1 kink, 0 stutters',
    });
  });

  it('describes the elevation part with its height range, climbing and steepest gradient', () => {
    expect(describeScorePart(part('elevation', { range: 18.6, climb: 31.2, maxGradient: 0.0796 }))).toEqual({
      label: 'Elevation',
      detail: '19 m between lowest and highest point, 31 m of climbing; steepest 8%',
    });
  });
});

describe('describeProfile', () => {
  const stats = {
    min: 4.2, max: 23.4, range: 19.2, climb: 31.7, maxGradient: 0.0796,
    tightestCrestRadius: 240, maxFill: 1.23, maxCut: 2.41, steepestBank: 0.093,
  };

  it('lists the road height facts in plain words', () => {
    expect(describeProfile(stats)).toEqual([
      ['Height range', '19 m (4 to 23 m)'],
      ['Total climb', '32 m per lap'],
      ['Steepest gradient', '8%'],
      ['Deepest cut', '2.4 m'],
      ['Tallest fill', '1.2 m'],
      ['Steepest bank between sections', '9%'],
    ]);
  });

  it('leaves out the bank line when no sections are close together', () => {
    const labels = describeProfile({ ...stats, steepestBank: 0 }).map(([label]) => label);
    expect(labels).not.toContain('Steepest bank between sections');
  });
});

describe('describeFit', () => {
  const spot = (value: number) => ({ x: 0, z: 0, value, sample: 0 });
  const report = {
    deepestCut: spot(5.05), tallestFill: spot(4.6), steepestBank: spot(0.584), closestSections: spot(46.2),
    nearestWater: spot(43.6), groundThroughRoad: 0, roadFloating: 0,
  };

  it('lists how the road sits in the island, in plain words', () => {
    expect(describeFit(report)).toEqual({
      clean: true,
      facts: [
        ['Deepest cutting', '5.1 m'],
        ['Tallest embankment', '4.6 m'],
        ['Steepest bank', '58%'],
        ['Sea nearest the road', '44 m'],
        ['Closest sections', '46 m apart'],
        ['Ground through the road', 'none'],
        ['Road left hanging', 'none'],
      ],
    });
  });

  it('says so when no sections are close', () => {
    const facts = describeFit({ ...report, closestSections: null }).facts;
    expect(facts).toContainEqual(['Closest sections', 'none within 55 m']);
  });

  it('is not clean when ground shows through or the road hangs', () => {
    const poking = describeFit({ ...report, groundThroughRoad: 3 });
    expect(poking.clean).toBe(false);
    expect(poking.facts).toContainEqual(['Ground through the road', '3 points']);
    const hanging = describeFit({ ...report, roadFloating: 1 });
    expect(hanging.clean).toBe(false);
    expect(hanging.facts).toContainEqual(['Road left hanging', '1 point']);
  });
});

describe('summariseTracks', () => {
  const results = [1, 2, 3, 4, 5, 6].map((seed) => generateTrack(seed, config));
  const summary = summariseTracks(results);

  it('counts the tracks and the styles', () => {
    expect(summary).toMatch(/^6 tracks: /);
    const styles = /(\d+) folded, (\d+) stretched, (\d+) round/.exec(summary)!;
    expect(Number(styles[1]) + Number(styles[2]) + Number(styles[3])).toBe(6);
  });

  it('gives the range of lap lengths and scores, and how many have a hairpin', () => {
    const laps = results.map((r) => Math.round(r.candidates[r.winnerIndex]!.line.length));
    expect(summary).toContain(`laps ${Math.min(...laps)} to ${Math.max(...laps)} m`);
    expect(summary).toMatch(/scores \d+ to \d+/);
    expect(summary).toMatch(/\d of 6 with a hairpin/);
  });

  it('counts the reliefs and the coasts', () => {
    const reliefs = /(\d+) flat, (\d+) rolling, (\d+) hilly, (\d+) mountain/.exec(summary)!;
    expect(Number(reliefs[1]) + Number(reliefs[2]) + Number(reliefs[3]) + Number(reliefs[4])).toBe(6);
    const coasts = /(\d+) inland, (\d+) touching the sea, (\d+) coastal/.exec(summary)!;
    expect(Number(coasts[1]) + Number(coasts[2]) + Number(coasts[3])).toBe(6);
  });

  it('counts the mountain shapes, and how the mountain seeds use their mountain', () => {
    const shapes = /(\d+) ridged range, (\d+) hill country, (\d+) lone peak/.exec(summary)!;
    expect(Number(shapes[1]) + Number(shapes[2]) + Number(shapes[3])).toBe(6);
    const mountainSeeds = results.filter((r) => r.character.relief === 'mountain');
    const climbing = mountainSeeds.filter((r) => r.character.route === 'climb').length;
    expect(summary).toContain(`${mountainSeeds.length} mountain (${climbing} climbing, ${mountainSeeds.length - climbing} circling)`);
  });

  it('mentions fallbacks only when there are some', () => {
    expect(summary).not.toContain('fallback');
    const forced = generateTrack(1, { ...config, track: { ...config.track, minCornerRadius: 5000 } });
    expect(summariseTracks([forced])).toContain('1 fell back to a plain oval');
  });

  it('copes with an empty list', () => {
    expect(summariseTracks([])).toBe('No tracks yet');
  });
});
