import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld } from '../generate';
import { generateTrack } from '../track/pipeline';
import type { Candidate, TrackResult } from '../types';
import { sampleField } from '../world/heightfield';
import { wallPieces } from './barriers';
import { bridgedMask, spanLength } from './bridges';
import { cutAndFill } from './profile';
import { walledPieces } from './walls';

const winnerOf = (result: TrackResult): Candidate => result.candidates[result.winnerIndex]!;

describe('bridges on real seeds (M6.1a)', () => {
  const tracks = Array.from({ length: 40 }, (_, k) => generateTrack(k + 1, config));

  it('keeps every winner of seeds 1 to 40 within 6 m of fill off its bridges, and every bridge within the longest span', { timeout: 60_000 }, () => {
    for (const track of tracks) {
      const winner = winnerOf(track);
      const mask = bridgedMask(winner.bridges, winner.line.count);
      for (let i = 0; i < winner.line.count; i++) {
        if (!mask[i]) expect(cutAndFill(i, winner.profile).fill, `seed ${track.seed} sample ${i}`).toBeLessThanOrEqual(config.road.maxFill);
      }
      for (const span of winner.bridges) expect(spanLength(span, winner.line.spacing)).toBeLessThanOrEqual(config.road.bridges.maxLength);
    }
  });

  it('gives some of seeds 1 to 40 a bridge, each standing over more than 6 m of fill somewhere', () => {
    const bridged = tracks.filter((track) => winnerOf(track).bridges.length > 0);
    expect(bridged.length).toBeGreaterThan(0);
    for (const track of bridged) {
      const winner = winnerOf(track);
      for (const span of winner.bridges) {
        let deepest = 0;
        for (let k = 0; k < span.sampleCount; k++) deepest = Math.max(deepest, winner.profile.height[(span.startIndex + k) % winner.line.count]! - winner.profile.ground[(span.startIndex + k) % winner.line.count]!);
        // The middle of the road, or one of its edges, stands over more than 6 m: the middle alone at least over the end fill.
        expect(deepest, `seed ${track.seed}`).toBeGreaterThan(config.road.bridges.endFill);
      }
    }
  });

  it('hands the winner’s bridges to the world’s road, numbered from the start line', { timeout: 30_000 }, () => {
    const track = tracks.find((t) => winnerOf(t).bridges.length > 0)!;
    const world = generateWorld(track.seed, config);
    expect(world.road.bridges.spans).toEqual(winnerOf(world.track).bridges);
    expect(world.road.bridges.spans).toEqual(winnerOf(track).bridges);
  });
});

describe('seed 7’s bridge in the world (M6.1b)', () => {
  const world = generateWorld(7, config);
  const { line, profile } = winnerOf(world.track);
  const n = line.count;
  const rules = config.road.bridges;
  const spans = world.road.bridges.spans;
  const at = (field: typeof world.ground, i: number, lateral: number): number =>
    sampleField(field, line.x[i]! - line.tz[i]! * lateral, line.z[i]! + line.tx[i]! * lateral, 0);

  it('has one bridge', () => {
    expect(spans.length).toBeGreaterThan(0);
  });

  it('leaves the natural ground under it where it lies clear of the deck, and the road’s own ground where it stands higher', () => {
    for (const span of spans) {
      // Away from its ends, which meet the embankments.
      for (let k = 5; k < span.sampleCount - 5; k++) {
        const i = (span.startIndex + k) % n;
        for (const lateral of [-5, 0, 5]) {
          // The grid cell nearest the point: the fit sets cells, and a height read between a natural cell and a cut one is neither.
          const x = line.x[i]! - line.tz[i]! * lateral;
          const z = line.z[i]! + line.tx[i]! * lateral;
          const c = Math.round((z - world.ground.origin) / world.ground.cell) * world.ground.size + Math.round((x - world.ground.origin) / world.ground.cell);
          // The road surface over the cell itself, up to 2 m away along an 8% slope or across a banked road: within 0.3 m.
          const surface = profile.height[i]! + world.road.cross[i]! * lateral;
          const below = world.ground.height[c]!;
          const clear = below <= surface - rules.deckDepth - rules.underClearance + 0.3;
          const cut = Math.abs(below - (surface - config.road.sink)) < 0.3;
          expect(clear || cut, `sample ${i}: ${below} under a road at ${surface}`).toBe(true);
          // The fit leaves the island before its coast was carved; carving it moves the ground near the sea by a few centimetres.
          if (clear) expect(below, `sample ${i}`).toBeLessThanOrEqual(world.natural.height[c]! + 0.15);
        }
      }
    }
    // Somewhere it stands well clear of the ground: a bridge, not a deck on the ground.
    const middle = (spans[0]!.startIndex + Math.floor(spans[0]!.sampleCount / 2)) % n;
    expect(profile.height[middle]! - at(world.ground, middle, 0)).toBeGreaterThan(3);
  });

  it('has a railing at full height along both sides of every bridge', () => {
    const pieces = wallPieces(line, profile.height, world.road.cross, world.road.width, world.road.walls, config);
    for (const side of [1, -1] as const) {
      const walled = walledPieces(world.road.walls, n, side);
      for (const span of spans) {
        for (let k = 0; k < span.sampleCount - 1; k++) expect(walled[(span.startIndex + k) % n], `side ${side} piece ${span.startIndex + k}`).toBe(1);
      }
    }
    // `wallPieces` gives each wall's pieces in turn, in the order of `Road.walls`: the k-th of a wall starts at its sample + k.
    const bridged = bridgedMask(spans, n);
    let p = 0;
    let checked = 0;
    for (const wall of world.road.walls) {
      for (let k = 0; k < Math.min(wall.pieceCount, n); k++, p++) {
        const i = (wall.startIndex + k) % n;
        if (!bridged[i] || !bridged[(i + 1) % n]) continue;
        expect(pieces[p]!.rise, `piece ${i}`).toEqual([config.road.barrierHeight, config.road.barrierHeight]);
        checked++;
      }
    }
    expect(p).toBe(pieces.length);
    expect(checked).toBe(2 * spans.reduce((sum, span) => sum + span.sampleCount - 1, 0));
  });

  it('counts no road hanging in the air over the ground left under a bridge', () => {
    expect(world.report.roadFloating).toBe(0);
    expect(world.report.groundThroughRoad).toBe(0);
  });

  it('draws the deck and its pillars', () => {
    expect(world.road.bridges.mesh.indices.length).toBeGreaterThan(0);
  });
});
