import * as THREE from 'three';
import { SunLight } from 'three/addons/lights/SunLight.js';
import type { Point3 } from '../camera/flyAlong';
import type { RenderConfig } from '../config';
import type { HeightField, WorldResult } from '../gen/types';
import { sampleField } from '../gen/world/heightfield';
import { createBloom } from './bloom';
import type { KartPose } from './carShape';
import { createCarView, createGhostView, type EffectTextures } from './carView';
import type { SpeedLine } from './driftEffects';
import { createSpeedLinesView } from './speedLinesView';
import { createCloudView } from './cloudView';
import { cloudDrift } from './clouds';
import type { Daylight } from './daylight';
import { CASTER_LAYER, createDecorView } from './decorView';
import { pixelRatioFor } from './quality';
import { grassEye } from './grass';
import { grassGrid } from './grassMaps';
import { createGrassView } from './grassView';
import { TERRAIN, toLinear, type Rgb } from './palette';
import { createRoadMaterial, createRoadMesh } from './road';
import { shadowReach } from './nearShadows';
import { createShadeView } from './shadeView';
import { createSkyDome } from './sky';
import { buildTerrainChunks, chunkStrides, detailOptions } from './terrainChunks';
import { createWater } from './water';
import { waterDepthGrid } from './waterDepth';

/** What the renderer is drawing, for checks and the performance pass. */
export interface ViewStats {
  /** Pieces of ground in the scene. */
  chunks: number;
  /** How many of those are drawn in full, at a quarter of the triangles and at a sixteenth. */
  levels: [number, number, number];
  /** Triangles and draw calls in the last frame. */
  triangles: number;
  calls: number;
  /** Trees, rocks and cloud puffs being shown: none when they are hidden. */
  trees: number;
  rocks: number;
  puffs: number;
  /** Groups of trees or rocks close enough to the camera to be drawn with their full shapes. */
  nearGroups: number;
  /** Grass blades in the fields round the camera: none when they are hidden, or the camera is too high to see one. */
  blades: number;
  /** The share of the island's land in the land's own shadow at the time of day shown (0 to 1); 0 with shadows off. */
  shaded: number;
  /** How far from the camera trees, rocks and barriers cast shadows, in metres; 0 with shadows off. */
  shadowReach: number;
  /** Shader programs Three.js has built so far: it should stop growing once the island has been drawn. */
  programs: number;
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
  /** Pixels of the light green-blue of shallow water, and near-white like foam. */
  shallow: number;
  foam: number;
  /** Near-white pixels in the top two fifths of the picture: clouds, when that part is sky. */
  cloud: number;
  /** A fingerprint of every pixel, to tell whether two pictures are the same. */
  digest: number;
  /** A fingerprint of the top two fifths of the picture alone: the sky, when the camera looks level. */
  skyDigest: number;
  /** A fingerprint of the bottom two fifths of the picture alone: the ground in front of the camera. */
  lowDigest: number;
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
  /** Moves the sea's waves to this many seconds on their clock. */
  setWaveTime(seconds: number): void;
  /** Moves the clouds to this many seconds on their clock. */
  setCloudTime(seconds: number): void;
  /** Shows or hides every tree, rock and cloud. */
  setDecorShown(shown: boolean): void;
  /** Moves the wind in the grass to this many seconds on its clock. */
  setGrassTime(seconds: number): void;
  /** Shows or hides the grass blades. */
  setGrassShown(shown: boolean): void;
  /** Shows or hides every shadow. */
  setShadowsShown(shown: boolean): void;
  /** Shows or hides the surface of the sea. Hidden, the sea bed shows: for telling what the water costs. */
  setWaterShown(shown: boolean): void;
  /** Puts the camera at `eye`, looking at `look`. Both are in metres. */
  setCamera(eye: Point3, look: Point3): void;
  /** How tall the view is, in degrees. */
  setFieldOfView(degrees: number): void;
  /** Draws the kart where the pose says (`kartPose`), or hides it for null. */
  setCar(pose: KartPose | null): void;
  /** Draws a ghost where the pose says (`ghostPose`), `opacity` solid, or hides it for null (M5.3). */
  setGhost(pose: KartPose | null, opacity: number): void;
  /** The pictures the drift's effects are drawn with, once loaded (`loadEffectTextures`). */
  setEffectTextures(textures: EffectTextures): void;
  /** The speed lines over the picture while a boost runs (`speedLines`); none for an empty list. */
  setSpeedLines(lines: SpeedLine[]): void;
  /** Turns the glow round the drift's effects on or off (`render.bloom`, `bloom=0` in the address). */
  setBloom(on: boolean): void;
  /** Fits the picture to the window: `pixelRatio` is the screen's pixels for each of the page's. No more than the view's budget of pixels is drawn. */
  resize(width: number, height: number, pixelRatio: number): void;
  render(): void;
  /**
   * Waits until the graphics card has finished everything it was asked to draw. Browsers hand drawing over and
   * carry on, so without this the time between frames says little about what a frame costs.
   */
  finish(): void;
  stats(): ViewStats;
  pixelCounts(): PixelCounts;
  /** The name of the graphics card doing the drawing, as the browser gives it. */
  graphics(): string;
  dispose(): void;
}

const colour = (rgb: Rgb): THREE.Color => new THREE.Color(toLinear(rgb[0]), toLinear(rgb[1]), toLinear(rgb[2]));

/**
 * @param cfg the render settings for the quality level shown (`qualitySettings`)
 * @param pixels the most pixels to draw in a frame
 */
export function createWorldView(canvas: HTMLCanvasElement, cfg: RenderConfig, pixels: number): WorldView {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // A frame is several draws (the scene, the bloom, the speed lines): what it drew is counted from the start of `render`, not of the last draw.
  renderer.info.autoReset = false;
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
  // The sun casts crisp shadows from trees, rocks, barriers and the gate near the camera, on two shadow maps fitted to the view.
  // The land's and the clouds' shadows reach much further and cost far less: they come from \`shade\` below.
  const near = cfg.shadows.near;
  const sun = new SunLight();
  sun.castShadow = true;
  sun.shadow.mapSize.set(near.mapSize, near.mapSize);
  sun.shadow.bias = near.bias;
  sun.shadow.normalBias = near.normalBias;
  sun.shadow.radius = near.radius;
  sun.shadow.camera.far = near.reach[0];
  // The shadow maps draw only what is on the casters' layer: trees' far shapes, rocks, barriers and the gate.
  sun.shadow.camera.layers.set(CASTER_LAYER);
  scene.add(sun);
  let shadowsShown = true;

  // The sea: see-through in the shallows, coloured by the depth of the ground under it.
  // The land's and the clouds' shadows, which every material the sun lights takes.
  const shade = createShadeView(cfg.shadows, cloudDrift(cfg.water.wind, cfg.clouds.speed, cfg.clouds.edgeFade));
  const water = createWater(cfg.seaSize, cfg.water, shade);
  scene.add(water.mesh);
  const seaGeometry = new THREE.PlaneGeometry(cfg.seaSize, cfg.seaSize).rotateX(-Math.PI / 2);

  // The bed of the open sea, the same colour as the deepest ground, so the
  // edge of the pieces of sea bed that are drawn cannot be seen through the water.
  const floorMaterial = new THREE.MeshBasicMaterial({ color: colour(TERRAIN.seaBed) });
  const floor = new THREE.Mesh(seaGeometry, floorMaterial);
  floor.position.y = cfg.seaFloorDepth;
  scene.add(floor);

  const groundMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
  shade.patch(groundMaterial);
  const ground = new THREE.Group();
  scene.add(ground);

  const roadMaterial = createRoadMaterial();
  shade.patch(roadMaterial);
  const road = new THREE.Group();
  scene.add(road);

  // Trees, rocks and clouds: scenery on top of the ground and in the sky.
  const decor = createDecorView(cfg.decor, (material) => shade.patch(material));
  scene.add(decor.object);
  // The kart, hidden until it is given a pose; it takes the land's and clouds' shadows like the road.
  const car = createCarView(cfg.car, (material) => shade.patch(material));
  scene.add(car.object);
  // A ghost of a run on record, see-through, hidden until it is given a pose (M5.3).
  const ghost = createGhostView(cfg.car, (material) => shade.patch(material));
  scene.add(ghost.object);
  // The glow round the drift's effects, and the speed lines over the picture (6h-5).
  const bloom = createBloom(renderer, cfg.bloom);
  const speedLinesView = createSpeedLinesView();
  const smokeLight = new THREE.Color();
  const clouds = createCloudView(cloudDrift(cfg.water.wind, cfg.clouds.speed, cfg.clouds.edgeFade), cfg.clouds.glow, cfg.daylight.skyStrength, cfg.clouds.thin);
  scene.add(clouds.object);

  // Grass blades in fields that follow the camera, swayed by the sea's wind.
  const grass = createGrassView(cfg.grass, cfg.water.wind, shade);
  scene.add(grass.object);
  let grassShown = true;
  /** How many pieces of ground are drawn at each level of detail. */
  let levels: [number, number, number] = [0, 0, 0];
  /** The ground of the world shown, to tell how high the camera is above it. */
  let land: HeightField | null = null;
  /** The point the camera was last aimed at. */
  const aim = new THREE.Vector3();
  const onePixel = new Uint8Array(4);

  /** Everything that follows the camera, moved to it. Called before every picture. */
  const follow = (): void => {
    sky.mesh.position.copy(camera.position);
    decor.update(camera.position);
    clouds.lookFrom(camera.position);
    // From high above no blade could be told from the ground, so the fields are left out altogether.
    const below = land ? Math.max(0, sampleField(land, camera.position.x, camera.position.z, 0)) : 0;
    grass.object.visible = grassShown && land !== null && camera.position.y - below <= cfg.grass.ceiling;
    sun.shadow.camera.far = shadowReach(camera.position.y - below, near);
    if (grass.object.visible) grass.lookFrom(grassEye(camera.position, aim));
  };

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
      // Ground far from the road is only ever seen from a distance, so it is drawn with fewer triangles; so is deep sea bed.
      const options = detailOptions(cfg, winner.line);
      const depths = waterDepthGrid(world.ground, cfg.seaFloorDepth);
      water.setDepths(depths);
      // The grass stands on the same heights the water measures its depth from, and only where the ground is drawn in full.
      grass.load(water.depthTexture(), depths, grassGrid(world, cfg.grass, chunkStrides(world.ground, options)));
      land = world.ground;
      const chunks = buildTerrainChunks(world.ground, world.cover, options);
      levels = [0, 0, 0];
      for (const chunk of chunks) {
        levels[chunk.stride >= 4 ? 2 : chunk.stride >= 2 ? 1 : 0]++;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(chunk.positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(chunk.colors, 3));
        geometry.setIndex(new THREE.BufferAttribute(chunk.indices, 1));
        // Needed so chunks outside the view are skipped.
        geometry.computeBoundingSphere();
        const piece = new THREE.Mesh(geometry, groundMaterial);
        // The ground takes the near shadows; its own shadows come from the land's shade map.
        piece.receiveShadow = true;
        ground.add(piece);
      }
      const asphalt = createRoadMesh(world.road.mesh, roadMaterial);
      const kerbs = createRoadMesh(world.road.kerbs.mesh, roadMaterial);
      const barriers = createRoadMesh(world.road.barriers, roadMaterial);
      const gate = createRoadMesh(world.road.gate, roadMaterial);
      // The gates a lap is counted by (M5.4d).
      const lapGates = createRoadMesh(world.road.lapGates.mesh, roadMaterial);
      // The bridges' decks and pillars (M6.1b).
      const bridges = createRoadMesh(world.road.bridges.mesh, roadMaterial);
      for (const mesh of [asphalt, kerbs, barriers, gate, lapGates, bridges]) mesh.receiveShadow = true;
      // Kerbs lie flat on the road; the barriers, the gates and the bridges stand up and cast.
      for (const mesh of [barriers, gate, lapGates, bridges]) {
        mesh.castShadow = true;
        mesh.layers.enable(CASTER_LAYER);
      }
      road.add(asphalt, kerbs, barriers, gate, lapGates, bridges);
      decor.load(world.decor);
      shade.setGround(world.ground);
      shade.setClouds(world.clouds);
      clouds.load(world.clouds);
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
      // The smoke is not lit by the sun's shader: it is given the sky's light and half the sun's, as a pale grey takes them.
      smokeLight.copy(skyLight.color).multiplyScalar(light.skyStrength).add(new THREE.Color().copy(sun.color).multiplyScalar(light.sunStrength * 0.5));
      smokeLight.setRGB(Math.min(1, smokeLight.r), Math.min(1, smokeLight.g), Math.min(1, smokeLight.b));
      car.setLight(smokeLight);
      sun.position.set(light.sun.x, light.sun.y, light.sun.z).multiplyScalar(1000);
      sky.update(light);
      shade.setSun(light.sun);
      water.setDaylight(light);
      clouds.setDaylight(light);
      grass.setDaylight(light);
    },

    setWaveTime(seconds) {
      water.setTime(seconds);
    },

    setCloudTime(seconds) {
      shade.setTime(seconds);
      clouds.setTime(seconds);
    },

    setDecorShown(shown) {
      // No clouds, no clouds' shadows.
      shade.setCloudsOn(shown);
      decor.object.visible = shown;
      clouds.object.visible = shown;
    },

    setGrassTime(seconds) {
      grass.setTime(seconds);
    },

    setGrassShown(shown) {
      grassShown = shown;
    },

    setShadowsShown(shown) {
      shade.setOn(shown);
      shadowsShown = shown;
      sun.castShadow = shown;
    },

    setWaterShown(shown) {
      water.mesh.visible = shown;
    },

    setCamera(eye, look) {
      camera.position.set(eye.x, eye.y, eye.z);
      camera.lookAt(look.x, look.y, look.z);
      aim.set(look.x, look.y, look.z);
    },

    setFieldOfView(degrees) {
      if (camera.fov === degrees) return;
      camera.fov = degrees;
      camera.updateProjectionMatrix();
    },

    setCar(pose) {
      car.set(pose);
    },

    setGhost(pose, opacity) {
      ghost.set(pose, opacity);
    },

    setEffectTextures(textures) {
      car.setTextures(textures);
    },

    setSpeedLines(lines) {
      speedLinesView.set(lines);
    },

    setBloom(on) {
      bloom.setOn(on);
    },

    resize(width, height, pixelRatio) {
      renderer.setPixelRatio(pixelRatioFor(width, height, pixelRatio, pixels, cfg.maxPixelRatio));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const drawing = renderer.getDrawingBufferSize(new THREE.Vector2());
      bloom.setSize(drawing.x, drawing.y);
    },

    render() {
      follow();
      renderer.info.reset();
      renderer.render(scene, camera);
      bloom.render(scene, camera, car);
      speedLinesView.render(renderer);
    },

    finish() {
      // Reading a pixel back cannot be answered until every drawing command before it is done.
      const gl = renderer.getContext();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, onePixel);
    },

    stats() {
      const shown = decor.object.visible;
      const counts = decor.counts();
      return {
        chunks: ground.children.length,
        levels: [...levels],
        triangles: renderer.info.render.triangles,
        calls: renderer.info.render.calls,
        trees: shown ? counts.trees : 0,
        rocks: shown ? counts.rocks : 0,
        puffs: shown ? clouds.count() : 0,
        nearGroups: shown ? counts.nearGroups : 0,
        blades: grass.object.visible ? grass.count() : 0,
        shaded: shade.shaded(),
        shadowReach: shadowsShown ? sun.shadow.camera.far : 0,
        programs: renderer.info.programs?.length ?? 0,
      };
    },

    pixelCounts() {
      // Draw and read back in one go: the picture is only guaranteed to be there until the browser shows it.
      follow();
      renderer.info.reset();
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
      let shallow = 0;
      let foam = 0;
      let cloud = 0;
      let digest = 0;
      let skyDigest = 0;
      let lowDigest = 0;
      // The rows come from the bottom of the picture up: the top two fifths start here, and the bottom two fifths end here.
      const skyFrom = Math.floor(height * 0.6) * width * 4;
      const lowTo = Math.floor(height * 0.4) * width * 4;
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
        digest = (Math.imul(digest, 31) + ((r << 16) | (g << 8) | b)) | 0;
        if (p < lowTo) lowDigest = (Math.imul(lowDigest, 31) + ((r << 16) | (g << 8) | b)) | 0;
        if (p >= skyFrom) {
          skyDigest = (Math.imul(skyDigest, 31) + ((r << 16) | (g << 8) | b)) | 0;
          if (r > 185 && g > 185 && b > 185) cloud++;
        }
        if (r > 245 && g > 190 && b > 120) sun++;
        if (r > 200 && g > 215 && b > 215) foam++;
        else if (g > 110 && b > 100 && r < 110 && Math.abs(g - b) < 45) shallow++;
        if (r > 140 && g < 90 && b < 90) kerb++;
        else if (b > r + 30 && b > g) sea++;
        else if (g > b + 15 || (r > b + 25 && g > b + 10)) land++;
        else if (Math.abs(r - g) < 14 && Math.abs(g - b) < 18 && r > 40 && r < 130) road++;
      }
      const total = width * height;
      const mean = (sum: number[], count: number): [number, number, number] => [sum[0]! / count, sum[1]! / count, sum[2]! / count];
      return {
        total,
        land,
        sea,
        road,
        kerb,
        sun,
        shallow,
        foam,
        cloud,
        digest,
        skyDigest,
        lowDigest,
        mean: mean(sums, total),
        bands: bands.map((band) => mean(band, Math.max(1, band[3]!))),
      };
    },

    graphics() {
      const gl = renderer.getContext();
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    },

    dispose() {
      clearGround();
      groundMaterial.dispose();
      roadMaterial.dispose();
      seaGeometry.dispose();
      water.dispose();
      floorMaterial.dispose();
      sky.dispose();
      decor.dispose();
      car.dispose();
      ghost.dispose();
      bloom.dispose();
      speedLinesView.dispose();
      clouds.dispose();
      grass.dispose();
      renderer.dispose();
    },
  };
}
