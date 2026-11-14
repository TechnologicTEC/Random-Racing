import * as THREE from 'three';
import type { DecorViewConfig } from '../config';
import type { Decor, Scatter } from '../gen/types';
import { TREE_KINDS } from '../gen/world/decor';
import { groupScatter, type ScatterGroup } from './scatter';
import { rockShape, treeShape, type Detail, type Shape } from './treeShapes';

/** The trees and rocks of a world, drawn as many copies of a few shapes. */
export interface DecorView {
  /** Everything it draws. Hide it to hide every tree and rock. */
  object: THREE.Group;
  /** Replaces whatever is shown with these trees and rocks. */
  load(decor: Decor): void;
  /** Picks each group's near or far shapes by its distance from the camera. Call before drawing. */
  update(camera: THREE.Vector3): void;
  /** How many trees and rocks are loaded, and how many groups are showing their near shapes. */
  counts(): { trees: number; rocks: number; nearGroups: number };
  dispose(): void;
}

function toGeometry(shape: Shape): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(shape.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(shape.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(shape.indices, 1));
  return geometry;
}

/** One group of the map: the same things drawn with their near shape or their far one, never both. */
interface Drawn {
  group: ScatterGroup;
  near: THREE.InstancedMesh;
  far: THREE.InstancedMesh;
}

/**
 * Draws trees and rocks. The shapes and where each stands come as plain
 * numbers (`treeShapes.ts`, `scatter.ts`); this only wraps them for Three.js.
 *
 * Each kind in each square of the map is one draw call, so squares out of view
 * cost nothing, and squares far from the camera use shapes with a fraction of
 * the triangles.
 */
export function createDecorView(cfg: DecorViewConfig): DecorView {
  const object = new THREE.Group();
  // Trees are open underneath and their fronds are flat, so both sides of every triangle are drawn.
  const treeMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  const rockMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });

  const details: readonly Detail[] = ['near', 'far'];
  const treeShapes = TREE_KINDS.map((kind) => ({ near: treeShape(kind, 'near'), far: treeShape(kind, 'far') }));
  const rockShapes = { near: rockShape('near'), far: rockShape('far') };
  const treeGeometry = treeShapes.map((shapes) => ({ near: toGeometry(shapes.near), far: toGeometry(shapes.far) }));
  const rockGeometry = { near: toGeometry(rockShapes.near), far: toGeometry(rockShapes.far) };

  let drawn: Drawn[] = [];
  let trees = 0;
  let rocks = 0;

  const clear = (): void => {
    for (const { near, far } of drawn) {
      near.dispose();
      far.dispose();
    }
    object.clear();
    drawn = [];
  };

  const add = (
    scatter: Scatter,
    material: THREE.Material,
    sink: number,
    shapes: ReadonlyArray<{ top: number; reach: number }>,
    geometryOf: (kind: number) => { near: THREE.BufferGeometry; far: THREE.BufferGeometry },
  ): void => {
    for (const group of groupScatter(scatter, { cell: cfg.groupSize, sink, shade: cfg.shade, shapes })) {
      // The near and far copies share one list of matrices and one of tints.
      const matrices = new THREE.InstancedBufferAttribute(group.matrices, 16);
      const tints = new THREE.InstancedBufferAttribute(group.tints, 3);
      const sphere = new THREE.Sphere(new THREE.Vector3(group.centre.x, group.centre.y, group.centre.z), group.radius);
      const meshes = details.map((detail) => {
        const mesh = new THREE.InstancedMesh(geometryOf(group.kind)[detail], material, 0);
        mesh.instanceMatrix = matrices;
        mesh.instanceColor = tints;
        mesh.count = group.count;
        // Given, not worked out by Three.js, so a group out of view is skipped without visiting every tree.
        mesh.boundingSphere = sphere;
        mesh.matrixAutoUpdate = false;
        object.add(mesh);
        return mesh;
      });
      meshes[0]!.visible = false;
      drawn.push({ group, near: meshes[0]!, far: meshes[1]! });
    }
  };

  return {
    object,

    load(decor) {
      clear();
      add(decor.trees, treeMaterial, cfg.treeSink, treeShapes.map((shapes) => shapes.near), (kind) => treeGeometry[kind] ?? treeGeometry[0]!);
      add(decor.rocks, rockMaterial, cfg.rockSink, [rockShapes.near, rockShapes.near, rockShapes.near], () => rockGeometry);
      trees = decor.trees.count;
      rocks = decor.rocks.count;
    },

    update(camera) {
      for (const { group, near, far } of drawn) {
        const distance = Math.hypot(camera.x - group.centre.x, camera.y - group.centre.y, camera.z - group.centre.z) - group.radius;
        near.visible = distance < cfg.detailDistance;
        far.visible = !near.visible;
      }
    },

    counts() {
      return { trees, rocks, nearGroups: drawn.filter(({ near }) => near.visible).length };
    },

    dispose() {
      clear();
      for (const { near, far } of [...treeGeometry, rockGeometry]) {
        near.dispose();
        far.dispose();
      }
      treeMaterial.dispose();
      rockMaterial.dispose();
    },
  };
}
