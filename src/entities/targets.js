// ─────── Targets: humanoids, drones, contracts, generics ───────
// Owns the live `targets` array, the `hitablesCache` (rebuilt lazily from the
// city + alive targets), and the per-frame target movement / death animation.

import { scene } from '../scene.js';
import { TIER } from '../tier.js';
import { CONTRACTS, TARGET_TYPES, rand } from '../state.js';
import { buildingPositions, cityGroup } from '../world/city.js';

const THREE = window.THREE;

// ─── Target list & hitables cache ───
export const targets = []; // {mesh, type, alive, hp, hitBox, bounty, headBox, ...}
export const hitables = { cache: null, dirty: true };

// ─── Factories ───
export function makeHumanoid(skinColor, clothColor, helmetColor, look = {}){
  const g = new THREE.Group();
  // body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 2, 0.6),
    new THREE.MeshLambertMaterial({ color: clothColor })
  );
  body.position.y = 1;
  g.add(body);

  // VIP touch: tie / sash detail
  if (look.isVip) {
    const tie = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 1.2, 0.05),
      new THREE.MeshLambertMaterial({ color: 0xa83c2a })
    );
    tie.position.set(0, 1.2, 0.32);
    g.add(tie);
  }

  // head
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, TIER.headSeg, TIER.headSeg),
    new THREE.MeshLambertMaterial({ color: skinColor })
  );
  head.position.y = 2.4;
  head.name = 'head';
  g.add(head);

  // helmet (optional — civilians have none)
  if (helmetColor !== null) {
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, TIER.headSeg, TIER.headSeg, 0, Math.PI*2, 0, Math.PI/2.2),
      new THREE.MeshLambertMaterial({ color: helmetColor })
    );
    helmet.position.y = 2.55;
    g.add(helmet);
  } else {
    // hair tuft for civilians
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0x2a1a14 })
    );
    hair.position.y = 2.55;
    hair.scale.set(1.05, 0.6, 1.05);
    g.add(hair);
  }

  // legs
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.5, 0.6),
    new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
  );
  legs.position.y = 0.25;
  g.add(legs);

  // weapon
  if (look.hasRifle) {
    // long sniper rifle
    const r = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.18, 2.2),
      new THREE.MeshLambertMaterial({ color: 0x0a0a0a })
    );
    r.position.set(0.6, 1.3, 0.3);
    g.add(r);
    const sc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
    );
    sc.rotation.x = Math.PI / 2;
    sc.position.set(0.6, 1.4, 0.3);
    g.add(sc);
  } else if (!look.isVip) {
    // standard rifle
    const weapon = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.18, 1.4),
      new THREE.MeshLambertMaterial({ color: 0x0a0a0a })
    );
    weapon.position.set(0.6, 1.2, 0.4);
    g.add(weapon);
  }
  // VIPs are unarmed (more obvious as targets)

  g.userData.headRef = head;
  g.userData.bodyRef = body;
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

// Per-frame target update (called from main loop).
export function updateTargets(dt){
  for (const t of targets) {
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
            t.removed = true;
          }
        }
      } else {
        // human falls flat
        if (m.rotation.x > -Math.PI / 2) {
          m.rotation.x -= dt * 3;
          if (m.rotation.x < -Math.PI / 2) m.rotation.x = -Math.PI / 2;
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
