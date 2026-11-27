import { describe, expect, it } from 'vitest';
import { config } from '../../config';
import { generateWorld } from '../generate';
import { sampleField } from '../world/heightfield';
import { surfaceOf } from '../world/tunnelWorld';
import { generateTrack } from '../track/pipeline';
import type { Candidate, TrackResult } from '../types';
import { bridgedMask, spanLength } from './bridges';
import { cutAndFill } from './profile';
import { ROAD_MATERIAL } from './ribbon';
import { checkTunnelStart, underLid } from './tunnels';
import { walledPieces } from './walls';

const winnerOf = (result: TrackResult): Candidate => result.candidates[result.winnerIndex]!;

describe('tunnels on real seeds (M6.2a)', () => {
  const tracks = Array.from({ length: 40 }, (_, k) => generateTrack(k + 1, config));

  it('keeps every winner of seeds 1 to 40 within 8 m of cut off its tunnels, each tunnel within the longest, off the bridges and clear of the start line', { timeout: 60_000 }, () => {
    for (const track of tracks) {
      const winner = winnerOf(track);
      const n = winner.line.count;
      const tunnelled = bridgedMask(winner.tunnels, n);
      const bridged = bridgedMask(winner.bridges, n);
      for (let i = 0; i < n; i++) {
        if (!tunnelled[i]) expect(cutAndFill(i, winner.profile).cut, `seed ${track.seed} sample ${i}`).toBeLessThanOrEqual(config.road.maxCut);
        else expect(bridged[i], `seed ${track.seed} sample ${i} on a bridge and in a tunnel`).toBe(0);
      }
      for (const span of winner.tunnels) expect(spanLength(span, winner.line.spacing)).toBeLessThanOrEqual(config.road.tunnels.maxLength);
      // The winner's lap starts at sample 0.
      expect(checkTunnelStart(winner.line, winner.tunnels, 0, config.road), `seed ${track.seed}`).toEqual([]);
    }
  });

  it('gives some of seeds 1 to 40 a tunnel, each under more than 8 m of ground somewhere', () => {
    const tunnelled = tracks.filter((track) => winnerOf(track).tunnels.length > 0);
    expect(tunnelled.map((t) => t.seed)).toEqual(expect.arrayContaining([11, 13, 35]));
    for (const track of tunnelled) {
      const winner = winnerOf(track);
      for (const span of winner.tunnels) {
        let deepest = 0;
        for (let k = 0; k < span.sampleCount; k++) deepest = Math.max(deepest, cutAndFill((span.startIndex + k) % winner.line.count, winner.profile).cut);
        expect(deepest, `seed ${track.seed}`).toBeGreaterThan(config.road.maxCut);
      }
    }
  });

  it('hands the winner’s tunnels to the world’s road, numbered from the start line', { timeout: 30_000 }, () => {
    const world = generateWorld(11, config);
    expect(world.road.tunnels.spans.length).toBeGreaterThan(0);
    expect(world.road.tunnels.spans).toEqual(winnerOf(world.track).tunnels);
  });
});

// Seed 35's second lap gate stood in its tunnel before M6.2b.
describe('the tunnel in the world (M6.2b), on seeds 11, 13 and 35', () => {
  const worlds = [11, 13, 35].map((seed) => generateWorld(seed, config));

  it('builds each tunnel’s walls, ceiling and portals, and its lid with a cover for every corner', () => {
    for (const world of worlds) {
      const { mesh, lid } = world.road.tunnels;
      const materials = new Set(mesh.materials);
      for (const m of [ROAD_MATERIAL.tunnelWall, ROAD_MATERIAL.tunnelCeiling, ROAD_MATERIAL.portal]) expect(materials.has(m), `seed ${world.seed}`).toBe(true);
      const corners = lid.positions.length / 3;
      expect(corners).toBeGreaterThan(0);
      for (const map of [lid.cover.grass, lid.cover.sand, lid.cover.rock, lid.cover.snow, lid.cover.variation]) expect(map).toHaveLength(corners);
    }
  });

  it('walls both sides of the road all through every tunnel', () => {
    for (const world of worlds) {
      const n = world.road.width.length;
      for (const side of [-1, 1] as const) {
        const walled = walledPieces(world.road.walls, n, side);
        for (const span of world.road.tunnels.spans) {
          for (let k = 0; k < span.sampleCount - 1; k++) expect(walled[(span.startIndex + k) % n], `seed ${world.seed} side ${side}`).toBe(1);
        }
      }
    }
  });

  it(`stands no lap gate in a tunnel or within ${config.road.tunnels.gateClear} m of one`, () => {
    for (const world of worlds) {
      const { line } = winnerOf(world.track);
      const n = line.count;
      const clear = Math.ceil(config.road.tunnels.gateClear / line.spacing);
      for (const gate of world.road.lapGates.samples) {
        for (const span of world.road.tunnels.spans) {
          const k = (((gate - span.startIndex) % n) + n) % n;
          expect(k < span.sampleCount + clear || k > n - clear - 1, `seed ${world.seed} gate ${gate}`).toBe(false);
        }
      }
    }
  });

  it('grows grass on the lids, but at rough points (M6.2b-3)', () => {
    for (const world of worlds) {
      const { top } = world.road.tunnels;
      expect(top.cells.length, `seed ${world.seed}`).toBeGreaterThan(100);
      const rough = new Set(top.rough);
      let grassy = 0;
      for (const [i, c] of top.cells.entries()) {
        if (rough.has(c)) expect(top.grass[i], `seed ${world.seed} cell ${c}`).toBe(0);
        if (top.grass[i]! > 0) grassy++;
      }
      expect(grassy / top.cells.length, `seed ${world.seed}`).toBeGreaterThan(0.5);
    }
  });

  // The lids of seeds 11, 13 and 35 stand above the tree line (125 m), as the hill round them does; seed 82's comes down to 70 m.
  it('stands trees and rocks on a lid at its height, none under it and none by a rough point (M6.2b-3)', { timeout: 30_000 }, () => {
    let onLids = 0;
    for (const world of [...worlds, generateWorld(82, config)]) {
      const { line } = winnerOf(world.track);
      const tunnels = world.road.tunnels;
      const land = surfaceOf(world.ground, tunnels.top);
      const { rough } = tunnels.top;
      const { size, cell, origin } = world.ground;
      for (const scatter of [world.decor.trees, world.decor.rocks]) {
        for (let k = 0; k < scatter.count; k++) {
          const [x, z] = [scatter.x[k]!, scatter.z[k]!];
          if (!underLid(tunnels, line, tunnels.spans, x, z, config.road.tunnels.top.clear)) continue;
          expect(scatter.y[k], `seed ${world.seed} at ${x}, ${z}`).toBeCloseTo(sampleField(land, x, z, 0), 4);
          if (scatter === world.decor.trees && sampleField(land, x, z, 0) > sampleField(world.ground, x, z, 0) + 1) onLids++;
          for (const c of rough) {
            const d = Math.hypot(origin + (c % size) * cell - x, origin + Math.floor(c / size) * cell - z);
            expect(d, `seed ${world.seed} at ${x}, ${z}`).toBeGreaterThan(config.road.tunnels.top.clear);
          }
        }
      }
    }
    expect(onLids).toBeGreaterThan(10);
  });

});
