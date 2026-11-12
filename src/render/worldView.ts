import * as THREE from 'three';
import type { Point3 } from '../camera/flyAlong';
import type { RenderConfig } from '../config';
import type { WorldResult } from '../gen/types';
import { SEA, SKY, TERRAIN, toLinear, type Rgb } from './palette';
import { createRoadMaterial, createRoadMesh } from './road';
import { buildTerrainChunks } from './terrainChunks';

/** What the renderer is drawing, for checks and the performance pass. */
export interface ViewStats {
  /** Pieces of ground in the scene. */
  chunks: number;
  /** Triangles and draw calls in the last frame. */
  triangles: number;
  calls: number;
}

/** A rough census of the last frame, used by tests to confirm something sensible was drawn. */
export interface PixelCounts {
  total: number;
  /** Pixels that are clearly green or sandy. */
  land: number;
  /** Pixels that are clearly blue. */
  sea: number;
  /** Pixels that are the dark grey of asphalt. */
  road: number;
  /** Pixels that are the red of a kerb. */
  kerb: number;
}

/** The 3D picture of a world. It only draws data it is given; it decides nothing about the world. */
export interface WorldView {
  /** Replaces whatever is shown with this world. */
  load(world: WorldResult): void;
  /** Puts the camera at `eye`, looking at `look`. Both are in metres. */
  setCamera(eye: Point3, look: Point3): void;
  resize(width: number, height: number, pixelRatio: number): void;
  render(): void;
  stats(): ViewStats;
  pixelCounts(): PixelCounts;
  dispose(): void;
}

const colour = (rgb: Rgb): THREE.Color => new THREE.Color(toLinear(rgb[0]), toLinear(rgb[1]), toLinear(rgb[2]));

export function createWorldView(canvas: HTMLCanvasElement, cfg: RenderConfig): WorldView {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const scene = new THREE.Scene();
  scene.background = colour(SKY);
  scene.fog = new THREE.Fog(colour(SKY), cfg.fogNear, cfg.fogFar);

  const camera = new THREE.PerspectiveCamera(cfg.fieldOfView, 1, 1, cfg.fogFar * 1.5);

  // Plain daylight until the sky arrives: soft light from above and a sun from the south-west.
  scene.add(new THREE.HemisphereLight(0xcfe3f5, 0x6b5f4a, 1.5));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
  sun.position.set(-0.55, 0.75, 0.4).multiplyScalar(1000);
  scene.add(sun);

  // A flat sea, a little see-through so the shallows show. The water shader replaces it later.
  const seaGeometry = new THREE.PlaneGeometry(cfg.seaSize, cfg.seaSize).rotateX(-Math.PI / 2);
  const seaMaterial = new THREE.MeshStandardMaterial({ color: colour(SEA), transparent: true, opacity: 0.8, roughness: 0.35, metalness: 0 });
  const sea = new THREE.Mesh(seaGeometry, seaMaterial);
  scene.add(sea);

  // The bed of the open sea, the same colour as the deepest ground, so the
  // edge of the pieces of sea bed that are drawn cannot be seen through the water.
  const floorMaterial = new THREE.MeshBasicMaterial({ color: colour(TERRAIN.seaBed) });
  const floor = new THREE.Mesh(seaGeometry, floorMaterial);
  floor.position.y = cfg.seaFloorDepth;
  scene.add(floor);

  const groundMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
  const ground = new THREE.Group();
  scene.add(ground);

  const roadMaterial = createRoadMaterial();
  const road = new THREE.Group();
  scene.add(road);

  const clearGround = (): void => {
    for (const group of [ground, road]) {
      for (const child of group.children) (child as THREE.Mesh).geometry.dispose();
      group.clear();
    }
  };

  return {
    load(world) {
      clearGround();
      const chunks = buildTerrainChunks(world.ground, world.cover, { chunkCells: cfg.chunkCells, skipBelow: cfg.skipSeaBedBelow });
      for (const chunk of chunks) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(chunk.positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(chunk.colors, 3));
        geometry.setIndex(new THREE.BufferAttribute(chunk.indices, 1));
        // Needed so chunks outside the view are skipped.
        geometry.computeBoundingSphere();
        ground.add(new THREE.Mesh(geometry, groundMaterial));
      }
      road.add(createRoadMesh(world.road.mesh, roadMaterial));
      road.add(createRoadMesh(world.road.kerbs.mesh, roadMaterial));
      road.add(createRoadMesh(world.road.barriers, roadMaterial));
      road.add(createRoadMesh(world.road.gate, roadMaterial));
    },

    setCamera(eye, look) {
      camera.position.set(eye.x, eye.y, eye.z);
      camera.lookAt(look.x, look.y, look.z);
    },

    resize(width, height, pixelRatio) {
      renderer.setPixelRatio(Math.min(pixelRatio, cfg.maxPixelRatio));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },

    render() {
      renderer.render(scene, camera);
    },

    stats() {
      return { chunks: ground.children.length, triangles: renderer.info.render.triangles, calls: renderer.info.render.calls };
    },

    pixelCounts() {
      // Draw and read back in one go: the picture is only guaranteed to be there until the browser shows it.
      renderer.render(scene, camera);
      const gl = renderer.getContext();
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let land = 0;
      let sea = 0;
      let road = 0;
      let kerb = 0;
      for (let p = 0; p < pixels.length; p += 4) {
        const r = pixels[p]!;
        const g = pixels[p + 1]!;
        const b = pixels[p + 2]!;
        if (r > 140 && g < 90 && b < 90) kerb++;
        else if (b > r + 30 && b > g) sea++;
        else if (g > b + 15 || (r > b + 25 && g > b + 10)) land++;
        else if (Math.abs(r - g) < 14 && Math.abs(g - b) < 18 && r > 40 && r < 130) road++;
      }
      return { total: width * height, land, sea, road, kerb };
    },

    dispose() {
      clearGround();
      groundMaterial.dispose();
      roadMaterial.dispose();
      seaGeometry.dispose();
      seaMaterial.dispose();
      floorMaterial.dispose();
      renderer.dispose();
    },
  };
}
