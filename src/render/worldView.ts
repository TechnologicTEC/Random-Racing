import * as THREE from 'three';
import type { Point3 } from '../camera/flyAlong';
import type { RenderConfig } from '../config';
import type { WorldResult } from '../gen/types';
import type { Daylight } from './daylight';
import { SEA, TERRAIN, toLinear, type Rgb } from './palette';
import { createRoadMaterial, createRoadMesh } from './road';
import { createSkyDome } from './sky';
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
  /** Pixels as bright and warm as the sun's disc. */
  sun: number;
  /** Mean colour (0 to 255 each) of the whole picture, and of five bands from top to bottom. */
  mean: [number, number, number];
  bands: Array<[number, number, number]>;
}

/** The 3D picture of a world. It only draws data it is given; it decides nothing about the world. */
export interface WorldView {
  /** Replaces whatever is shown with this world. */
  load(world: WorldResult): void;
  /** Lights the world, and colours its sky and haze, for a moment of the day. */
  setDaylight(light: Daylight): void;
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
  // The haze and the background share the colour of the sky at the horizon, set with the daylight.
  const haze = new THREE.Color();
  scene.background = haze;
  const fog = new THREE.Fog(haze, cfg.fogNear, cfg.fogFar);
  scene.fog = fog;

  const far = cfg.fogFar * 1.5;
  const camera = new THREE.PerspectiveCamera(cfg.fieldOfView, 1, 1, far);

  const sky = createSkyDome(far * cfg.sky.domeShare, cfg.sky);
  scene.add(sky.mesh);

  // Light from the whole sky, and the sun. Their colours and strengths come with the daylight.
  const skyLight = new THREE.HemisphereLight();
  scene.add(skyLight);
  const sun = new THREE.DirectionalLight();
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
      const winner = world.track.candidates[world.track.winnerIndex]!;
      const chunks = buildTerrainChunks(world.ground, world.cover, {
        chunkCells: cfg.chunkCells,
        skipBelow: cfg.skipSeaBedBelow,
        // Ground far from the road is only ever seen from a distance, so it is drawn with a quarter of the triangles.
        far: { x: winner.line.x, z: winner.line.z, distance: cfg.detailDistance, stride: cfg.farStride },
      });
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

    setDaylight(light) {
      const linear = (target: THREE.Color, rgb: Rgb): THREE.Color => target.setRGB(toLinear(rgb[0]), toLinear(rgb[1]), toLinear(rgb[2]));
      linear(haze, light.haze);
      fog.color.copy(haze);
      linear(skyLight.color, light.skyLight);
      linear(skyLight.groundColor, light.groundLight);
      skyLight.intensity = light.skyStrength;
      linear(sun.color, light.sunColour);
      sun.intensity = light.sunStrength;
      sun.position.set(light.sun.x, light.sun.y, light.sun.z).multiplyScalar(1000);
      sky.update(light);
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
      sky.mesh.position.copy(camera.position);
      renderer.render(scene, camera);
    },

    stats() {
      return { chunks: ground.children.length, triangles: renderer.info.render.triangles, calls: renderer.info.render.calls };
    },

    pixelCounts() {
      // Draw and read back in one go: the picture is only guaranteed to be there until the browser shows it.
      sky.mesh.position.copy(camera.position);
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
      let sun = 0;
      const sums = [0, 0, 0];
      const bands = Array.from({ length: 5 }, () => [0, 0, 0, 0]);
      for (let p = 0; p < pixels.length; p += 4) {
        const r = pixels[p]!;
        const g = pixels[p + 1]!;
        const b = pixels[p + 2]!;
        sums[0] += r;
        sums[1] += g;
        sums[2] += b;
        // The rows come from the bottom of the picture up.
        const band = bands[4 - Math.min(4, Math.floor((p / 4 / width / height) * 5))]!;
        band[0] += r;
        band[1] += g;
        band[2] += b;
        band[3]++;
        if (r > 245 && g > 190 && b > 120) sun++;
        if (r > 140 && g < 90 && b < 90) kerb++;
        else if (b > r + 30 && b > g) sea++;
        else if (g > b + 15 || (r > b + 25 && g > b + 10)) land++;
        else if (Math.abs(r - g) < 14 && Math.abs(g - b) < 18 && r > 40 && r < 130) road++;
      }
      const total = width * height;
      const mean = (sum: number[], count: number): [number, number, number] => [sum[0]! / count, sum[1]! / count, sum[2]! / count];
      return { total, land, sea, road, kerb, sun, mean: mean(sums, total), bands: bands.map((band) => mean(band, Math.max(1, band[3]!))) };
    },

    dispose() {
      clearGround();
      groundMaterial.dispose();
      roadMaterial.dispose();
      seaGeometry.dispose();
      seaMaterial.dispose();
      floorMaterial.dispose();
      sky.dispose();
      renderer.dispose();
    },
  };
}
