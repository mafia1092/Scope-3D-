// ─────── City: Kenney Retro Urban Kit composed buildings ───────
// Loads GLB prototypes from /assets, then composes real multi-floor
// buildings, roads, props, vehicles, trees, and cliffs around the
// 8 sniper nests. Avoids spawning anywhere within 18u of a nest.
//
// Exports buildingPositions for target placement / minimap rendering
// (same {x, z, w, d, h, top} shape the rest of the codebase expects).

import * as THREE from 'three';
import { GLTFLoader } from 'https://unpkg.com/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import { scene } from '../scene.js';
import { rand } from '../state.js';
import { NESTS } from './nests.js';

export const cityGroup = new THREE.Group();
scene.add(cityGroup);

// {x, z, w, d, h, top} — used by targets.spawnTargets and ui.updateMinimap
export const buildingPositions = [];

// ─────── Asset registry ───────
const ASSETS = {
  buildings: ['wall-a', 'wall-b', 'wall-c-flat', 'wall-a-window', 'wall-b-window',
              'wall-a-flat-window', 'wall-b-flat-window', 'wall-a-corner', 'wall-b-corner',
              'wall-a-door', 'wall-b-door', 'roof-metal-type-a', 'roof-metal-type-b'],
  vehicles: ['truck-grey', 'truck-green', 'truck-flat', 'truck-grey-cargo'],
  props: ['detail-dumpster-closed', 'detail-dumpster-open', 'detail-light-traffic',
          'detail-light-double', 'detail-awning-wide', 'detail-awning-small',
          'detail-barrier-type-a', 'detail-barrier-type-b', 'detail-bench',
          'detail-block', 'pallet'],
  nature: ['tree-pine-large', 'tree-pine-small', 'tree-park-large', 'tree-shrub',
           'grass', 'grass-hill', 'cliff-side', 'cliff-corner'],
  roads: ['road-asphalt-straight', 'road-asphalt-corner', 'road-asphalt-pavement',
          'road-dirt-straight'],
  scaffolding: ['scaffolding-poles', 'scaffolding-floor', 'scaffolding-structure'],
};

// Loaded GLTF prototypes — { 'wall-a': THREE.Group, ... }
export const KIT = {};

const loader = new GLTFLoader();

function loadGLB(category, name){
  return new Promise((resolve, reject) => {
    loader.load(
      `./assets/${category}/${name}.glb`,
      gltf => {
        const root = gltf.scene;
        // Make all meshes shadow-aware-friendly (we don't use shadows but harmless)
        // Also ensure all materials are properly set up for the noir pipeline.
        root.traverse(obj => {
          if (obj.isMesh) {
            obj.castShadow = false;
            obj.receiveShadow = false;
            // Materials from Kenney are MeshStandardMaterial; they catch our scene lighting fine.
          }
        });
        KIT[name] = root;
        resolve();
      },
      undefined,
      err => reject(new Error(`Failed to load ${category}/${name}: ${err}`))
    );
  });
}

export async function preloadKit(onProgress){
  const all = [];
  for (const [cat, names] of Object.entries(ASSETS)) {
    for (const n of names) all.push([cat, n]);
  }
  let done = 0;
  await Promise.all(all.map(([cat, n]) =>
    loadGLB(cat, n).then(() => {
      done++;
      onProgress?.(done, all.length, n);
    })
  ));
}

// Helper: clone a loaded asset for instancing
export function instantiate(name){
  const proto = KIT[name];
  if (!proto) {
    console.warn('Asset not preloaded:', name);
    return new THREE.Group();
  }
  return proto.clone(true);
}

// ─────── Building composition ───────
// Kenney Retro Urban Kit modules are roughly 4-unit wall pieces and ~4-unit
// floor heights. Tuned by inspecting a few of the GLB bounding boxes during
// development. A single floor of a 2x2 building is therefore ~8x4x8 units.
const FLOOR_HEIGHT = 4;
const WALL_WIDTH   = 4;

const WALL_TYPES_A = ['wall-a', 'wall-a-window', 'wall-a-flat-window'];
const WALL_TYPES_B = ['wall-b', 'wall-b-window', 'wall-b-flat-window'];
// 'wall-c-flat' is a featureless flat panel — used as occasional accent on
// upper floors so building silhouettes aren't 100% windowed.
const WALL_FLAT = 'wall-c-flat';

function pickWall(types){ return types[Math.floor(Math.random() * types.length)]; }

// Place a single wall piece at position with a given facing rotation.
// Walls are authored to face +z by default; pass yaw so they face outward.
function placeWall(group, name, x, y, z, ry){
  const piece = instantiate(name);
  piece.position.set(x, y, z);
  piece.rotation.y = ry;
  group.add(piece);
}

function makeBuilding(width, depth, floors){
  // width/depth are in wall-units. e.g. (3, 2, 4) = 3 wide, 2 deep, 4 floors.
  const g = new THREE.Group();

  const isA = Math.random() < 0.5;
  const wallTypes = isA ? WALL_TYPES_A : WALL_TYPES_B;
  const cornerType = isA ? 'wall-a-corner' : 'wall-b-corner';
  const doorType = isA ? 'wall-a-door' : 'wall-b-door';
  // Roof is shared between styles — picked randomly.
  const roofType = Math.random() < 0.5 ? 'roof-metal-type-a' : 'roof-metal-type-b';

  // Half-extents along x (width) and z (depth) in world units.
  const halfW = (width  * WALL_WIDTH) / 2;
  const halfD = (depth  * WALL_WIDTH) / 2;

  for (let f = 0; f < floors; f++) {
    const y = f * FLOOR_HEIGHT;

    // Track door placement per-floor: only ground floor (f===0) gets a door,
    // and only one door per floor to avoid Swiss-cheese facades.
    const doorPlaced = { val: false };

    function maybeDoor(name){
      if (f === 0 && !doorPlaced.val && Math.random() < 0.4) {
        doorPlaced.val = true;
        return doorType;
      }
      // ~12% of upper-floor wall slots become flat-panel for visual rhythm.
      if (f > 0 && Math.random() < 0.12) return WALL_FLAT;
      return name;
    }

    // ─ South edge (z = -halfD), facing -z, so rotate 180°
    for (let i = 0; i < width; i++) {
      const x = -halfW + WALL_WIDTH/2 + i * WALL_WIDTH;
      placeWall(g, maybeDoor(pickWall(wallTypes)), x, y, -halfD, Math.PI);
    }
    // ─ North edge (z = +halfD), facing +z, no rotation
    for (let i = 0; i < width; i++) {
      const x = -halfW + WALL_WIDTH/2 + i * WALL_WIDTH;
      placeWall(g, maybeDoor(pickWall(wallTypes)), x, y, halfD, 0);
    }
    // ─ East edge (x = +halfW), facing +x, rotate -π/2
    for (let i = 0; i < depth; i++) {
      const z = -halfD + WALL_WIDTH/2 + i * WALL_WIDTH;
      placeWall(g, maybeDoor(pickWall(wallTypes)), halfW, y, z, -Math.PI/2);
    }
    // ─ West edge (x = -halfW), facing -x, rotate π/2
    for (let i = 0; i < depth; i++) {
      const z = -halfD + WALL_WIDTH/2 + i * WALL_WIDTH;
      placeWall(g, maybeDoor(pickWall(wallTypes)), -halfW, y, z, Math.PI/2);
    }

    // Corner pieces — anchored at the 4 corners of the footprint.
    const cornerPositions = [
      [-halfW, y, -halfD, 0],
      [ halfW, y, -halfD, -Math.PI/2],
      [ halfW, y,  halfD, Math.PI],
      [-halfW, y,  halfD, Math.PI/2],
    ];
    for (const [cx, cy, cz, ry] of cornerPositions) {
      const c = instantiate(cornerType);
      c.position.set(cx, cy, cz);
      c.rotation.y = ry;
      g.add(c);
    }
  }

  // Roof on top — single tile centered. Kenney roof tiles are ~4x4u; for
  // larger footprints we tile across the rooftop in a grid.
  const roofY = floors * FLOOR_HEIGHT;
  for (let rx = 0; rx < width; rx++) {
    for (let rz = 0; rz < depth; rz++) {
      const roof = instantiate(roofType);
      roof.position.set(
        -halfW + WALL_WIDTH/2 + rx * WALL_WIDTH,
        roofY,
        -halfD + WALL_WIDTH/2 + rz * WALL_WIDTH
      );
      g.add(roof);
    }
  }

  // Mark world-space height (used by callers that want to place targets on roof)
  g.userData.height = roofY;

  return g;
}

// ─────── Nest avoidance helpers ───────
function tooCloseToNest(x, z, threshold = 18){
  for (const n of NESTS) {
    if (Math.hypot(n.x - x, n.z - z) < threshold) return true;
  }
  return false;
}

// Returns true if (x,z) is on the road grid (within `pad` of a road centerline).
const ROAD_TILE = 4;
const ROAD_LENGTH_TILES = 30;
const ROAD_HALF_LENGTH = ROAD_LENGTH_TILES * ROAD_TILE;
function onRoad(x, z, pad = 4){
  // Cross of roads through origin: |x| < pad AND |z| < ROAD_HALF_LENGTH+pad → on N-S road
  // Or |z| < pad AND |x| < ROAD_HALF_LENGTH+pad → on E-W road
  if (Math.abs(x) < pad && Math.abs(z) < ROAD_HALF_LENGTH + pad) return true;
  if (Math.abs(z) < pad && Math.abs(x) < ROAD_HALF_LENGTH + pad) return true;
  return false;
}

// ─────── buildCity: ring placements ───────
export function buildCity(){
  // Footprint ranges in wall-units; floor heights in storeys.
  const rings = [
    { count: 8,  rDist: 70,  wMin: 2, wMax: 3, dMin: 2, dMax: 3, fMin: 2, fMax: 3 },
    { count: 12, rDist: 130, wMin: 2, wMax: 4, dMin: 2, dMax: 4, fMin: 3, fMax: 4 },
    { count: 14, rDist: 200, wMin: 3, wMax: 4, dMin: 3, dMax: 4, fMin: 3, fMax: 5 },
  ];

  rings.forEach(ring => {
    for (let i = 0; i < ring.count; i++) {
      const angle = (i / ring.count) * Math.PI * 2 + rand(-0.08, 0.08);
      const dist = ring.rDist + rand(-10, 10);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      if (tooCloseToNest(x, z)) continue;

      const w = Math.floor(rand(ring.wMin, ring.wMax + 1));
      const d = Math.floor(rand(ring.dMin, ring.dMax + 1));
      const f = Math.floor(rand(ring.fMin, ring.fMax + 1));

      const bldg = makeBuilding(w, d, f);
      bldg.position.set(x, 0, z);
      bldg.rotation.y = Math.random() * Math.PI * 2;
      cityGroup.add(bldg);

      const worldW = w * WALL_WIDTH;
      const worldD = d * WALL_WIDTH;
      const worldH = f * FLOOR_HEIGHT;
      buildingPositions.push({ x, z, w: worldW, d: worldD, h: worldH, top: worldH });
    }
  });

  buildRoads();
  buildScatter();
}

// ─────── Roads ───────
export function buildRoads(){
  const g = new THREE.Group();

  // Cross of asphalt straights. Skip the centermost tiles to make room
  // for the corner pieces / center intersection.
  for (let i = -ROAD_LENGTH_TILES; i <= ROAD_LENGTH_TILES; i++) {
    if (Math.abs(i) < 2) continue;

    // North-south road (varies in z)
    const ns = instantiate('road-asphalt-straight');
    ns.position.set(0, 0.02, i * ROAD_TILE);
    g.add(ns);

    // East-west road (varies in x), perpendicular -> rotate 90°
    const ew = instantiate('road-asphalt-straight');
    ew.position.set(i * ROAD_TILE, 0.02, 0);
    ew.rotation.y = Math.PI / 2;
    g.add(ew);
  }

  // Pavement / sidewalk strips along the road (a thin strip on each long edge,
  // a couple tiles in from the center to feel like blocks of city).
  for (let i = -ROAD_LENGTH_TILES; i <= ROAD_LENGTH_TILES; i++) {
    if (Math.abs(i) < 2) continue;
    if (Math.random() > 0.55) continue;
    const side = Math.random() < 0.5 ? -1 : 1;

    const pavN = instantiate('road-asphalt-pavement');
    pavN.position.set(side * ROAD_TILE, 0.025, i * ROAD_TILE);
    g.add(pavN);

    const pavE = instantiate('road-asphalt-pavement');
    pavE.position.set(i * ROAD_TILE, 0.025, side * ROAD_TILE);
    pavE.rotation.y = Math.PI / 2;
    g.add(pavE);
  }

  // Corner piece at the four endpoints (just decorative bookends)
  const corners = [
    [-ROAD_HALF_LENGTH - ROAD_TILE, 0,  0, 0],
    [ ROAD_HALF_LENGTH + ROAD_TILE, 0,  0, Math.PI],
    [0, 0, -ROAD_HALF_LENGTH - ROAD_TILE, -Math.PI/2],
    [0, 0,  ROAD_HALF_LENGTH + ROAD_TILE, Math.PI/2],
  ];
  for (const [cx, cy, cz, ry] of corners) {
    const c = instantiate('road-asphalt-corner');
    c.position.set(cx, 0.02 + cy, cz);
    c.rotation.y = ry;
    g.add(c);
  }

  // Mark road tiles as non-shootable so raycast doesn't waste cycles on them
  g.traverse(o => { o.userData.noShoot = true; });
  cityGroup.add(g);
}

// ─────── Scatter: vehicles, props, trees, cliffs, grass ───────
export function buildScatter(){
  const g = new THREE.Group();

  // ── 4 trucks parked along streets near intersections, one per truck variant
  const truckNames = ['truck-grey', 'truck-green', 'truck-flat', 'truck-grey-cargo'];
  truckNames.forEach((name, i) => {
    // Pick a slot along one of the four arms of the cross at +/- 28-50 along the road
    let x, z, ry, tries = 0;
    do {
      const along = (Math.random() < 0.5 ? -1 : 1) * rand(28, 50);
      const arm = i % 4;
      // 0: north arm (parked along x axis, varying z)
      // 1: south arm
      // 2: east arm (varying x, parallel to z=0)
      // 3: west arm
      if (arm === 0)      { x = 6;  z = along;        ry = 0; }
      else if (arm === 1) { x = -6; z = along;        ry = Math.PI; }
      else if (arm === 2) { x = along; z = 6;         ry = -Math.PI/2; }
      else                { x = along; z = -6;        ry = Math.PI/2; }
      tries++;
    } while (tooCloseToNest(x, z, 12) && tries < 8);
    if (tries >= 8) return;

    const t = instantiate(name);
    t.position.set(x, 0.05, z);
    t.rotation.y = ry + rand(-0.08, 0.08);
    g.add(t);
  });

  // ── 6 dumpsters / props / pallets scattered around buildings (avoid roads + nests)
  const propPool = [
    'detail-dumpster-closed', 'detail-dumpster-open',
    'detail-awning-wide', 'detail-awning-small',
    'detail-barrier-type-a', 'detail-barrier-type-b',
    'detail-bench', 'detail-block', 'pallet',
  ];
  for (let i = 0; i < 14; i++) {
    let x, z, tries = 0;
    do {
      const angle = rand(0, Math.PI * 2);
      const dist = rand(50, 180);
      x = Math.cos(angle) * dist;
      z = Math.sin(angle) * dist;
      tries++;
    } while ((tooCloseToNest(x, z, 12) || onRoad(x, z, 5)) && tries < 12);
    if (tries >= 12) continue;

    const name = propPool[Math.floor(Math.random() * propPool.length)];
    const p = instantiate(name);
    p.position.set(x, 0.02, z);
    p.rotation.y = Math.random() * Math.PI * 2;
    g.add(p);
  }

  // ── Streetlights at intersections (placed on the street corners, not nests)
  const lightSpots = [
    [ 8, 0,  8], [-8, 0,  8], [ 8, 0, -8], [-8, 0, -8],
    [ 8, 0,  60], [-8, 0,  60], [ 8, 0, -60], [-8, 0, -60],
  ];
  for (let i = 0; i < lightSpots.length; i++) {
    const [x, , z] = lightSpots[i];
    if (tooCloseToNest(x, z, 12)) continue;
    const name = (i % 2 === 0) ? 'detail-light-traffic' : 'detail-light-double';
    const l = instantiate(name);
    l.position.set(x, 0.02, z);
    l.rotation.y = Math.atan2(-z, -x);
    g.add(l);
  }

  // ── 10 trees + bushes at the city perimeter (radius 250-280)
  const treeNames = ['tree-pine-large', 'tree-pine-small', 'tree-park-large', 'tree-shrub'];
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 + rand(-0.2, 0.2);
    const dist = rand(250, 280);
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (tooCloseToNest(x, z, 12)) continue;

    const name = treeNames[Math.floor(Math.random() * treeNames.length)];
    const t = instantiate(name);
    t.position.set(x, 0.02, z);
    t.rotation.y = Math.random() * Math.PI * 2;
    g.add(t);
  }

  // ── 6 cliff pieces at the very far perimeter (radius 320-360) as background terrain
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + rand(-0.1, 0.1);
    const dist = rand(320, 360);
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const name = (i % 3 === 0) ? 'cliff-corner' : 'cliff-side';
    const c = instantiate(name);
    c.position.set(x, 0, z);
    // Face inward toward center so the cliff face shows the city
    c.rotation.y = Math.atan2(-z, -x);
    c.scale.setScalar(2.5);
    g.add(c);
  }

  // ── 6 grass tiles + 2 grass-hill, scattered green patches between buildings
  for (let i = 0; i < 6; i++) {
    let x, z, tries = 0;
    do {
      const angle = rand(0, Math.PI * 2);
      const dist = rand(40, 200);
      x = Math.cos(angle) * dist;
      z = Math.sin(angle) * dist;
      tries++;
    } while ((tooCloseToNest(x, z, 12) || onRoad(x, z, 6)) && tries < 12);
    if (tries >= 12) continue;
    const tile = instantiate('grass');
    tile.position.set(x, 0.02, z);
    tile.rotation.y = Math.random() * Math.PI * 2;
    g.add(tile);
  }
  for (let i = 0; i < 2; i++) {
    const angle = rand(0, Math.PI * 2);
    const dist = rand(220, 260);
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const hill = instantiate('grass-hill');
    hill.position.set(x, 0.02, z);
    hill.rotation.y = Math.random() * Math.PI * 2;
    g.add(hill);
  }

  // ── A small dirt road branch from the perimeter going outward
  for (let k = 0; k < 4; k++) {
    const angle = Math.PI * 0.7 + k * 0.05;
    const baseDist = 220;
    const x = Math.cos(angle) * (baseDist + k * ROAD_TILE);
    const z = Math.sin(angle) * (baseDist + k * ROAD_TILE);
    const dirt = instantiate('road-dirt-straight');
    dirt.position.set(x, 0.02, z);
    dirt.rotation.y = angle + Math.PI / 2;
    g.add(dirt);
  }

  // ── A small scaffolding cluster near one of the corners (uses all 3 scaffold parts)
  const sx = -120, sz = -120;
  if (!tooCloseToNest(sx, sz, 12)) {
    const poles = instantiate('scaffolding-poles');
    poles.position.set(sx, 0, sz);
    g.add(poles);

    const floor = instantiate('scaffolding-floor');
    floor.position.set(sx, 4, sz);
    g.add(floor);

    const struct = instantiate('scaffolding-structure');
    struct.position.set(sx + 4, 0, sz);
    g.add(struct);
  }

  // Scatter shouldn't be hit-tested as primary geometry — mark items noShoot
  // so the rifle's raycast cache stays small.
  g.traverse(o => { o.userData.noShoot = true; });
  cityGroup.add(g);
}

// ─── Ground plane (kept dark for noir mood) ───
export function buildGround(){
  const groundGeo = new THREE.PlaneGeometry(2000, 2000);
  // Very dark, almost black — lets the dusk fog and silhouettes pop.
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x1a1d20 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.userData.noShoot = true;
  scene.add(ground);
}
