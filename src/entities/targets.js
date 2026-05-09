// ─────── Targets: humanoids, drones, contracts, generics ───────
// Owns the live `targets` array, the `hitablesCache` (rebuilt lazily from the
// city + alive targets), and the per-frame target movement / death animation.

import * as THREE from 'three';
import { scene } from '../scene.js';
import { TIER } from '../tier.js';
import { CONTRACTS, TARGET_TYPES, rand } from '../state.js';
import { buildingPositions, cityGroup } from '../world/city.js';

// ─── Target list & hitables cache ───
export const targets = []; // {mesh, type, alive, hp, hitBox, bounty, headBox, ...}
export const hitables = { cache: null, dirty: true };

// ─── Noir palette (fallbacks if look colors aren't supplied) ───
// Dark olive, dusty olive, charcoal, rust — and matching darker hood variants.
const NOIR_PALETTE = {
  cloth: [0x2c3a2c, 0x3a352c, 0x2a2a2c, 0x3a2a25],
  hood:  [0x1c2820, 0x2a2620, 0x1a1a1c, 0x2a1c14],
  boots: 0x14110e,
  rifle: 0x1a1c1f,
  scope: 0x0a0a0d,
  hands: 0x14100c,
};

// ─── Factories ───
// Hooded-coat sniper silhouette. Keeps the original parameter signature so
// CONTRACTS / TARGET_TYPES configs (cloth/helmet colors, isVip, hasRifle)
// keep working. Adds an optional `look.variant` (1-4) for subtle silhouette
// differences. Civilians (helmetColor === null) get a less imposing pose
// and no rifle. Total height ≈ 3 units, base at y = 0 (matches the old
// humanoid so existing CONTRACTS placements don't need to change).
export function makeHumanoid(skinColor, clothColor, helmetColor, look = {}){
  const g = new THREE.Group();
  const variant = (look.variant >= 1 && look.variant <= 4) ? look.variant : 1;
  const isCivilian = (helmetColor === null);
  // Variant 2 swaps the hood for the optional helmet (or bare head).
  const hasHood = (variant !== 2) && !(isCivilian && variant !== 3);
  // Variant 3 = shorter, more military coat.
  const coatBottomY = (variant === 3) ? 0.8 : 0.55;

  // Resolve palette: if cloth color was provided, derive a dimmer hood
  // tint from it; otherwise pick from NOIR_PALETTE by variant index.
  const palIdx = (variant - 1) % NOIR_PALETTE.cloth.length;
  const coatHex = (clothColor != null) ? clothColor : NOIR_PALETTE.cloth[palIdx];
  const hoodHex = (clothColor != null)
    ? new THREE.Color(clothColor).multiplyScalar(0.55).getHex()
    : NOIR_PALETTE.hood[palIdx];

  // Shared materials (one per color) keep mesh count low without
  // extra bookkeeping — Three's renderer batches by material.
  const coatMat  = new THREE.MeshLambertMaterial({ color: coatHex });
  const hoodMat  = new THREE.MeshLambertMaterial({ color: hoodHex });
  const skinMat  = new THREE.MeshLambertMaterial({ color: skinColor });
  const bootMat  = new THREE.MeshLambertMaterial({ color: NOIR_PALETTE.boots });
  const rifleMat = new THREE.MeshLambertMaterial({ color: NOIR_PALETTE.rifle });

  // ─── Boots (one mesh, sits on the ground) ───
  const boots = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 0.25, 0.55),
    bootMat
  );
  boots.position.y = 0.125;
  g.add(boots);

  // ─── Coat (long tapered cone, neck → mid-shin) ───
  // Cone radii: bottom slightly wider for drape, top narrow at the neck.
  // Y range: coatBottomY (legs poke out below) → ~1.85 (neck).
  const coatHeight = 1.85 - coatBottomY;
  const coatTopR = 0.45;
  const coatBotR = (variant === 3) ? 0.55 : 0.7;
  const coat = new THREE.Mesh(
    new THREE.CylinderGeometry(coatTopR, coatBotR, coatHeight, 8, 1, false),
    coatMat
  );
  coat.position.y = coatBottomY + coatHeight / 2;
  g.add(coat);

  // ─── Optional vest (variant 4) — bulky torso piece over the coat ───
  if (variant === 4) {
    const vest = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.62, 0.85, 8),
      hoodMat // darker variant for contrast
    );
    vest.position.y = 1.35;
    g.add(vest);
  }

  // ─── Head (kept as a sphere; userData.headRef points here) ───
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, TIER.headSeg, TIER.headSeg),
    skinMat
  );
  head.position.y = 2.25;
  head.name = 'head';
  g.add(head);

  // ─── Hood OR helmet (mutually exclusive on the head) ───
  if (hasHood) {
    // Partial-sphere dome wrapping the top/back of the head.
    // phiStart/Length cuts open the front so the face is a pocket of shadow.
    const hoodDome = new THREE.Mesh(
      new THREE.SphereGeometry(
        0.42, TIER.headSeg, TIER.headSeg,
        Math.PI * 0.25, Math.PI * 1.5,        // open front wedge
        0, Math.PI * 0.65                      // truncate the bottom
      ),
      hoodMat
    );
    hoodDome.position.y = 2.28;
    g.add(hoodDome);

    // Drape that extends from the hood down past the shoulders.
    const drape = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.5, 0.55, 8, 1, true),
      hoodMat
    );
    drape.position.y = 1.95;
    g.add(drape);
  } else if (helmetColor !== null) {
    // Variant 2 (or non-hood) gets a helmet if one was specified.
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(
        0.38, TIER.headSeg, TIER.headSeg,
        0, Math.PI * 2, 0, Math.PI / 2.2
      ),
      new THREE.MeshLambertMaterial({ color: helmetColor })
    );
    helmet.position.y = 2.32;
    g.add(helmet);
  }
  // If no hood and no helmet, the bare head + skinColor remains visible.

  // ─── Rifle (skipped for civilians and unarmed VIPs) ───
  // VIPs with hasRifle still get one (e.g. THE GHOST).
  const wantRifle = !isCivilian && (look.hasRifle || !look.isVip);
  if (wantRifle) {
    const rifleG = new THREE.Group();
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6),
      rifleMat
    );
    barrel.rotation.z = Math.PI / 2; // lay along x
    rifleG.add(barrel);

    const stock = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.12),
      rifleMat
    );
    stock.position.x = -0.6;
    rifleG.add(stock);

    const scope = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.14, 0.14),
      new THREE.MeshLambertMaterial({ color: NOIR_PALETTE.scope })
    );
    scope.position.set(0, 0.16, 0);
    rifleG.add(scope);

    // Held diagonally across the chest, leaning low-right to high-left so
    // it stays well below the head — keeps headshot sightlines clean from
    // typical rooftop sniping angles.
    rifleG.position.set(0, 1.45, 0.32);
    rifleG.rotation.set(0, 0.55, -0.5);
    g.add(rifleG);

    // ─── Glove "hands" where the rifle meets the body ───
    const handMat = new THREE.MeshLambertMaterial({ color: NOIR_PALETTE.hands });
    const hand1 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), handMat);
    hand1.position.set(0.18, 1.45, 0.4);
    g.add(hand1);
    const hand2 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), handMat);
    hand2.position.set(-0.32, 1.45, 0.3);
    g.add(hand2);
  }

  // bodyRef = the coat (used by hit detection / death animation as the torso).
  g.userData.headRef = head;
  g.userData.bodyRef = coat;
  return g;
}

export function makeDrone(){
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 10, 10),
    new THREE.MeshLambertMaterial({ color: 0x2a2520 })
  );
  g.add(body);
  // arms
  const armMat = new THREE.MeshLambertMaterial({ color: 0x1a1610 });
  const arm1 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.15), armMat);
  g.add(arm1);
  const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 2.4), armMat);
  g.add(arm2);
  // rotors
  const rotorMat = new THREE.MeshBasicMaterial({ color: 0xa89968, transparent: true, opacity: 0.4 });
  const rotorsArray = [];
  [[1.2,0,0], [-1.2,0,0], [0,0,1.2], [0,0,-1.2]].forEach(([x,y,z]) => {
    const r = new THREE.Mesh(new THREE.CircleGeometry(0.45, 8), rotorMat);
    r.rotation.x = -Math.PI / 2;
    r.position.set(x, 0.1, z);
    g.add(r);
    rotorsArray.push(r);
  });
  // red light
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.08), new THREE.MeshBasicMaterial({ color: 0xff4030 }));
  light.position.set(0, -0.3, 0);
  g.add(light);

  g.userData.headRef = body; // drones don't have heads
  g.userData.bodyRef = body;
  g.userData.rotors = rotorsArray;
  return g;
}

// ─── Spawning ───
export function spawnTargets(){
  // Reset list (in case spawn is ever called twice)
  targets.length = 0;

  const usedRooftopBldgs = new Set();
  const rooftopBldgs = buildingPositions.filter(b => b.h > 30 && b.h < 90);

  function placeOnRooftop(look, bonus = {}){
    let b, tries = 0;
    do {
      b = rooftopBldgs[Math.floor(Math.random() * rooftopBldgs.length)];
      tries++;
    } while (usedRooftopBldgs.has(b) && tries < 20);
    usedRooftopBldgs.add(b);
    const human = makeHumanoid(look.skin, look.cloth, look.helmet, look);
    human.position.set(
      b.x + rand(-b.w/2 + 1, b.w/2 - 1),
      b.top,
      b.z + rand(-b.d/2 + 1, b.d/2 - 1)
    );
    human.rotation.y = rand(0, Math.PI * 2);
    scene.add(human);
    return { mesh: human, type: 'rooftop', bldg: b, ...bonus };
  }

  function placeOnGround(look, bonus = {}){
    const angle = rand(0, Math.PI * 2);
    const dist = rand(40, 90);
    const human = makeHumanoid(look.skin, look.cloth, look.helmet, look);
    human.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    human.rotation.y = rand(0, Math.PI * 2);
    scene.add(human);
    return { mesh: human, type: 'ground', ...bonus };
  }

  // Place named contract targets
  CONTRACTS.forEach((c, idx) => {
    let placed;
    if (c.type === 'rooftop') placed = placeOnRooftop(c.look);
    else placed = placeOnGround(c.look);

    targets.push({
      ...placed,
      alive: true,
      bounty: c.bounty,
      moveBase: { x: placed.mesh.position.x, z: placed.mesh.position.z },
      moveT: rand(0, Math.PI * 2),
      moveSpeed: rand(0.3, 0.6),
      moveRange: c.type === 'ground' ? rand(2, 4) : rand(0, 1.5),
      moveType: 'patrol',
      isContract: true,
      contractIdx: idx,
      alias: c.alias,
      kindLabel: c.alias,
    });
  });

  // Generic guards / soldiers / civilians
  const genericTypes = ['soldier','soldier','soldier','militia','civilian'];

  // 3 more rooftop generics
  for (let i = 0; i < 3; i++) {
    const tk = genericTypes[Math.floor(Math.random() * genericTypes.length)];
    const look = TARGET_TYPES[tk];
    const placed = placeOnRooftop(look);
    targets.push({
      ...placed,
      alive: true,
      bounty: tk === 'civilian' ? -200 : 100,
      moveBase: { x: placed.mesh.position.x, z: placed.mesh.position.z },
      moveT: rand(0, Math.PI * 2),
      moveSpeed: rand(0.3, 0.7),
      moveRange: rand(0, 2),
      moveType: Math.random() < 0.4 ? 'patrol' : 'static',
      isContract: false,
      kindLabel: look.label,
      targetKind: tk,
    });
  }

  // 3 ground generics
  for (let i = 0; i < 3; i++) {
    const tk = genericTypes[Math.floor(Math.random() * genericTypes.length)];
    const look = TARGET_TYPES[tk];
    const placed = placeOnGround(look);
    targets.push({
      ...placed,
      alive: true,
      bounty: tk === 'civilian' ? -200 : 100,
      moveBase: { x: placed.mesh.position.x, z: placed.mesh.position.z },
      moveT: rand(0, Math.PI * 2),
      moveSpeed: rand(0.4, 0.8),
      moveRange: rand(2, 5),
      moveType: 'patrol',
      isContract: false,
      kindLabel: look.label,
      targetKind: tk,
    });
  }

  // 3 drones
  for (let i = 0; i < 3; i++) {
    const angle = rand(0, Math.PI * 2);
    const dist = rand(50, 110);
    const drone = makeDrone();
    drone.position.set(Math.cos(angle) * dist, rand(40, 90), Math.sin(angle) * dist);
    scene.add(drone);
    targets.push({
      mesh: drone,
      type: 'drone',
      alive: true,
      bounty: 200,
      moveBase: { x: drone.position.x, z: drone.position.z, y: drone.position.y },
      moveT: rand(0, Math.PI * 2),
      moveSpeed: rand(0.4, 0.8),
      moveRange: rand(8, 18),
      moveType: 'fly',
      isContract: false,
      kindLabel: 'DRONE',
      targetKind: 'drone',
    });
  }

  // New target set — force rebuild on next fire
  hitables.dirty = true;
}

// Rebuild the cached "things a ray can hit" list. Called lazily on first
// fire after a target dies or is spawned.
export function rebuildHitables(){
  const arr = [];
  for (const t of targets) {
    if (!t.alive) continue;
    t.mesh.traverse(child => {
      if (child.isMesh) {
        child.userData.targetRef = t;
        arr.push(child);
      }
    });
  }
  cityGroup.traverse(child => {
    if (child.isMesh && !child.userData.noShoot) arr.push(child);
  });
  hitables.cache = arr;
  hitables.dirty = false;
}

// Marks a target dead and starts its fall/spin animation. Invalidates the
// hitables cache so the next fire rebuilds without the dead target.
export function animateDeath(target, isHead){
  const fallSpeed = target.type === 'drone' ? 8 : 2;
  target.deathT = 0;
  target.dying = true;
  target.fallSpeed = fallSpeed;
  target.tilt = isHead ? Math.PI / 3 : Math.PI / 6;
  target.spin = (Math.random() - 0.5) * (target.type === 'drone' ? 4 : 2);
  hitables.dirty = true;
}

// Free GPU buffers (geometries/materials) for a removed target mesh tree.
// Skips pooled/shared materials by checking _pooled flag (none today, but
// keeps us forward-safe).
function disposeMesh(root){
  root.traverse(o => {
    if (o.isMesh) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.map && m.map._pooled) continue;
          m.dispose && m.dispose();
        }
      }
    }
  });
}

// Per-frame target update (called from main loop).
export function updateTargets(dt){
  for (const t of targets) {
    if (t.removed) continue; // fully cleaned up — skip every frame
    if (t.dying) {
      t.deathT += dt;
      const m = t.mesh;
      if (t.type === 'drone') {
        m.position.y -= t.fallSpeed * dt;
        m.rotation.x += t.spin * dt;
        m.rotation.z += t.spin * 0.7 * dt;
        t.fallSpeed += 9.8 * dt; // gravity
        if (m.position.y < 0) {
          m.position.y = 0;
          if (t.deathT > 2 && !t.removed) {
            scene.remove(m);
            disposeMesh(m);
            t.removed = true;
          }
        }
      } else {
        // human falls flat, then ~1.5s later we yank from scene
        if (m.rotation.x > -Math.PI / 2) {
          m.rotation.x -= dt * 3;
          if (m.rotation.x < -Math.PI / 2) m.rotation.x = -Math.PI / 2;
        } else if (t.deathT > 1.8 && !t.removed) {
          scene.remove(m);
          disposeMesh(m);
          t.removed = true;
        }
      }
      continue;
    }
    if (!t.alive) continue;
    t.moveT += dt * t.moveSpeed;
    const m = t.mesh;
    if (t.moveType === 'patrol') {
      m.position.x = t.moveBase.x + Math.sin(t.moveT) * t.moveRange;
      m.position.z = t.moveBase.z + Math.cos(t.moveT * 0.7) * t.moveRange * 0.5;
      m.rotation.y = Math.atan2(
        Math.cos(t.moveT) * t.moveRange,
        -Math.sin(t.moveT * 0.7) * t.moveRange * 0.5 * 0.7
      );
    } else if (t.moveType === 'fly') {
      m.position.x = t.moveBase.x + Math.sin(t.moveT) * t.moveRange;
      m.position.z = t.moveBase.z + Math.cos(t.moveT * 0.6) * t.moveRange;
      m.position.y = t.moveBase.y + Math.sin(t.moveT * 1.5) * 3;
      m.rotation.y = t.moveT * 0.5;
      // spin rotors visually (use cached refs)
      const rotors = m.userData.rotors;
      if (rotors) {
        for (let i = 0; i < rotors.length; i++) {
          rotors[i].rotation.z += dt * 30;
        }
      } else {
        m.children.forEach(c => {
          if (c.geometry && c.geometry.type === 'CircleGeometry') {
            c.rotation.z += dt * 30;
          }
        });
      }
    }
  }
}
