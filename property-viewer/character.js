// ─────────────────────────────────────────────────────────────────────────
// character.js — configurable, rig-ready human figure for Three.js
//
// Builds an anthropometrically-proportioned human out of capsules + spheres
// (no boxes), scaled to real-world measurements. The skeleton is a nested
// THREE.Group hierarchy ("joints") so you can pose it or drive your own
// procedural animation by rotating joint groups.
//
// Units are METRES. A 1.75 m character is 1.75 units tall — drop it straight
// into a real-world-scaled scene.
//
// Usage:
//   import { createCharacter } from './character.js';
//   const human = createCharacter({ height: 1.80, build: 'average', gender: 'male' });
//   scene.add(human.root);
//   // 1st-person camera:   human.eyeAnchor.add(camera);
//   // pose an arm:         human.joints.shoulderR.rotation.x = -1.2;
//   // when done:           human.dispose();
//
// Proportions follow standard anthropometric ratios (fractions of stature;
// Drillis & Contini / NASA-STD-3000 body-segment data).
// ─────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';

// Joint heights as a fraction of total stature (H), measured from the floor.
const LANDMARKS = {
  eye:       0.936,
  headBase:  0.870, // chin / neck-head junction
  neckBase:  0.828, // top of torso
  shoulder:  0.818, // gleno-humeral joint
  elbow:     0.630,
  wrist:     0.485,
  hip:       0.530, // hip joint / pelvis centre
  knee:      0.285,
  ankle:     0.039,
};

// Half-widths from the body centreline (fraction of stature).
const WIDTHS = {
  shoulder: 0.115, // shoulder joint offset
  hip:      0.055, // hip joint offset
};

// Segment radii as a fraction of stature, at 'average' build.
const RADII = {
  neck:     0.034,
  head:     0.067,
  torso:    0.107,
  pelvis:   0.094,
  upperArm: 0.036,
  foreArm:  0.030,
  hand:     0.028,
  thigh:    0.058,
  shin:     0.042,
  foot:     0.036,
};

// Build multiplier scales every radius (girth), not the skeleton.
const BUILD = { slim: 0.84, average: 1.0, broad: 1.24 };

/**
 * Create a configurable human figure.
 * @param {object} opts
 * @param {number} opts.height        Stature in metres (default 1.75).
 * @param {'slim'|'average'|'broad'} opts.build   Girth (default 'average').
 * @param {'male'|'female'|'neutral'} opts.gender Shoulder/hip ratio (default 'neutral').
 * @param {number} opts.skinColor     Hex (default warm tan).
 * @param {number} opts.clothingColor Hex — upper body.
 * @param {number} opts.pantsColor    Hex — lower body.
 * @param {number} opts.hairColor     Hex.
 * @returns {{root:THREE.Group, joints:object, eyeAnchor:THREE.Object3D,
 *            eyeHeight:number, height:number, measurements:object, dispose:Function}}
 */
export function createCharacter(opts = {}) {
  const {
    height = 1.75,
    build = 'average',
    gender = 'neutral',
    skinColor = 0xc89a72,
    clothingColor = 0x3b4a5a,
    pantsColor = 0x2b2f37,
    hairColor = 0x2a2018,
  } = opts;

  const H = height;
  const girth = BUILD[build] ?? 1.0;
  // Sexual dimorphism: males carry broader shoulders / narrower hips, females
  // the reverse. 'neutral' sits in the middle.
  const shoulderMul = gender === 'male' ? 1.13 : gender === 'female' ? 0.90 : 1.0;
  const hipMul      = gender === 'male' ? 0.92 : gender === 'female' ? 1.15 : 1.0;

  // World-space helpers.
  const y = (k) => LANDMARKS[k] * H;          // landmark height in metres
  const r = (k) => RADII[k] * H * girth;      // segment radius in metres

  // ── Materials ──
  const mkMat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.82, metalness: 0.02 });
  const skinMat  = mkMat(skinColor);
  const clothMat = mkMat(clothingColor);
  const pantsMat = mkMat(pantsColor);
  const hairMat  = mkMat(hairColor);
  const materials = [skinMat, clothMat, pantsMat, hairMat];
  const geometries = [];

  const joints = {};

  // Capsule sized by TOTAL length (cylinder + both hemispherical caps).
  function capsule(totalLen, radius, material, { sx = 1, sz = 1 } = {}) {
    const cylLen = Math.max(0.004, totalLen - 2 * radius);
    const geo = new THREE.CapsuleGeometry(radius, cylLen, 6, 18);
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.scale.set(sx, 1, sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function sphere(radius, material, { sx = 1, sy = 1, sz = 1 } = {}) {
    const geo = new THREE.SphereGeometry(radius, 24, 18);
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // A "bone": a joint Group whose origin is the proximal joint; the limb
  // capsule hangs straight down (-Y) from it. Rotating the group swings the
  // whole limb about that joint — the basis of the rig.
  function bone(name, length, radius, material, scaleOpts) {
    const g = new THREE.Group();
    g.name = name;
    const mesh = capsule(length, radius, material, scaleOpts);
    mesh.position.y = -length / 2;
    g.add(mesh);
    g.userData.length = length;
    g.userData.mesh = mesh;
    joints[name] = g;
    return g;
  }

  // ── Skeleton scaffold ──
  const root = new THREE.Group();
  root.name = 'character-root';            // origin at the feet, on the floor

  const hips = new THREE.Group();
  hips.name = 'hips';
  hips.position.y = y('hip');
  joints.hips = hips;
  root.add(hips);

  // ── Pelvis (visual) ──
  const pelvisLen = (LANDMARKS.hip - LANDMARKS.knee) * H * 0.55;
  const pelvis = capsule(pelvisLen + r('pelvis'), r('pelvis'), pantsMat, { sx: hipMul * 1.05, sz: 0.72 });
  pelvis.position.y = -pelvisLen * 0.28;
  hips.add(pelvis);

  // ── Spine / torso ──
  const spine = new THREE.Group();
  spine.name = 'spine';
  joints.spine = spine;
  hips.add(spine);

  const torsoLen = y('neckBase') - y('hip');
  const torso = capsule(torsoLen + r('torso') * 0.4, r('torso'), clothMat, { sx: 1.0, sz: 0.62 });
  torso.position.y = torsoLen / 2;          // torso rises from the hips
  spine.add(torso);

  // chest: attachment point for neck + both arms, at shoulder height
  const chest = new THREE.Group();
  chest.name = 'chest';
  chest.position.y = y('shoulder') - y('hip');
  joints.chest = chest;
  spine.add(chest);

  // ── Neck + head ──
  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.y = y('neckBase') - y('shoulder');
  joints.neck = neck;
  chest.add(neck);

  const neckLen = y('headBase') - y('neckBase');
  const neckMesh = capsule(neckLen + r('neck'), r('neck'), skinMat, { sz: 0.9 });
  neckMesh.position.y = neckLen / 2;
  neck.add(neckMesh);

  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = neckLen;                // sits on top of the neck
  joints.head = head;
  neck.add(head);

  // head is a touch taller than it is wide
  const headCentreY = (y('eye') - y('headBase')) + r('head') * 0.15;
  const headMesh = sphere(r('head'), skinMat, { sy: 1.18, sz: 1.04 });
  headMesh.position.y = headCentreY;
  head.add(headMesh);

  // simple hair cap
  const hair = sphere(r('head') * 1.04, hairMat, { sy: 0.95, sz: 1.06 });
  hair.position.set(0, headCentreY + r('head') * 0.22, r('head') * 0.06);
  head.add(hair);

  // eye anchor — drop your 1st-person camera here (faces -Z, the body's front)
  const eyeAnchor = new THREE.Object3D();
  eyeAnchor.name = 'eyeAnchor';
  eyeAnchor.position.set(0, y('eye') - y('headBase'), -r('head') * 0.9);
  head.add(eyeAnchor);

  // ── Arms ──
  // sign: +X is the body's left in the default -Z facing.
  function buildArm(side) {
    const s = side === 'L' ? 1 : -1;
    const shoulderX = WIDTHS.shoulder * H * shoulderMul;

    const shoulder = new THREE.Group();
    shoulder.name = 'shoulder' + side;
    shoulder.position.set(s * shoulderX, 0, 0);
    // splay the arm a few degrees outward so it clears the torso
    shoulder.rotation.z = s * 0.14;
    joints['shoulder' + side] = shoulder;
    chest.add(shoulder);

    // deltoid cap so the shoulder reads round, not stuck-on
    const deltoid = sphere(r('upperArm') * 1.25, clothMat);
    shoulder.add(deltoid);

    const upperLen = y('shoulder') - y('elbow');
    const upperArm = capsule(upperLen, r('upperArm'), clothMat);
    upperArm.position.y = -upperLen / 2;
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.name = 'elbow' + side;
    elbow.position.y = -upperLen;
    joints['elbow' + side] = elbow;
    shoulder.add(elbow);

    const foreLen = y('elbow') - y('wrist');
    const foreArm = capsule(foreLen, r('foreArm'), skinMat);
    foreArm.position.y = -foreLen / 2;
    elbow.add(foreArm);

    const wrist = new THREE.Group();
    wrist.name = 'wrist' + side;
    wrist.position.y = -foreLen;
    joints['wrist' + side] = wrist;
    elbow.add(wrist);

    const handLen = 0.105 * H;
    const hand = capsule(handLen, r('hand'), skinMat, { sx: 1.25, sz: 0.55 });
    hand.position.y = -handLen / 2;
    wrist.add(hand);
  }
  buildArm('L');
  buildArm('R');

  // ── Legs ──
  function buildLeg(side) {
    const s = side === 'L' ? 1 : -1;
    const hipX = WIDTHS.hip * H * hipMul;

    const hipJoint = new THREE.Group();
    hipJoint.name = 'hip' + side;
    hipJoint.position.set(s * hipX, 0, 0);
    joints['hip' + side] = hipJoint;
    hips.add(hipJoint);

    const thighLen = y('hip') - y('knee');
    const thigh = capsule(thighLen, r('thigh'), pantsMat);
    thigh.position.y = -thighLen / 2;
    hipJoint.add(thigh);

    const knee = new THREE.Group();
    knee.name = 'knee' + side;
    knee.position.y = -thighLen;
    joints['knee' + side] = knee;
    hipJoint.add(knee);

    const shinLen = y('knee') - y('ankle');
    const shin = capsule(shinLen, r('shin'), pantsMat);
    shin.position.y = -shinLen / 2;
    knee.add(shin);

    const ankle = new THREE.Group();
    ankle.name = 'ankle' + side;
    ankle.position.y = -shinLen;
    joints['ankle' + side] = ankle;
    knee.add(ankle);

    // foot: a capsule lying along -Z (forward), resting on the floor
    const footLen = 0.152 * H;
    const foot = capsule(footLen, r('foot'), pantsMat, { sx: 0.78 });
    foot.rotation.x = Math.PI / 2;          // lay it flat, pointing forward
    foot.position.set(0, -y('ankle') + r('foot') * 0.55, -footLen * 0.30);
    ankle.add(foot);
  }
  buildLeg('L');
  buildLeg('R');

  // ── Real-world measurements (handy for HUDs / property tools) ──
  const measurements = {
    height:        +H.toFixed(3),
    eyeHeight:     +(y('eye')).toFixed(3),
    shoulderHeight:+(y('shoulder')).toFixed(3),
    hipHeight:     +(y('hip')).toFixed(3),
    shoulderWidth: +(2 * WIDTHS.shoulder * H * shoulderMul + 2 * r('upperArm') * 1.25).toFixed(3),
    armSpan:       +((2 * WIDTHS.shoulder * H * shoulderMul) +
                     2 * ((y('shoulder') - y('elbow')) + (y('elbow') - y('wrist')) + 0.105 * H)).toFixed(3),
    build,
    gender,
  };

  function dispose() {
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
  }

  return {
    root,                 // add this to your scene
    joints,               // every joint Group, keyed by name — the rig
    eyeAnchor,            // attach a camera here for 1st-person
    eyeHeight: measurements.eyeHeight,
    height: H,
    measurements,
    materials: { skinMat, clothMat, pantsMat, hairMat },
    dispose,
  };
}

// Joint names exposed on `.joints`, for reference / animation targeting.
export const JOINT_NAMES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'elbowL', 'wristL',
  'shoulderR', 'elbowR', 'wristR',
  'hipL', 'kneeL', 'ankleL',
  'hipR', 'kneeR', 'ankleR',
];
