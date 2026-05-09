// ─────── First-person rifle (attached to camera) ───────
// Builds the rifle mesh once and parents it to the camera. Animation state
// (target/current pose, recoil offset) lives here as mutable named exports
// so input/hud (toggleScope) and the main loop can mutate them.

import * as THREE from 'three';
import { camera } from '../scene.js';

export const rifle = new THREE.Group();

// Materials
const stockMat     = new THREE.MeshLambertMaterial({ color: 0x2a1f14 });
const metalMat     = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
const darkMetalMat = new THREE.MeshLambertMaterial({ color: 0x0a0a0a });
const accentMat    = new THREE.MeshLambertMaterial({ color: 0x3a3530 });

// Receiver / main body
const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.4), metalMat);
receiver.position.set(0, -0.08, -0.35);
rifle.add(receiver);
// Stock (back of gun)
const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.10, 0.18), stockMat);
stock.position.set(0, -0.10, -0.05);
rifle.add(stock);
// Cheek rest
const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.10), stockMat);
cheek.position.set(0, -0.04, -0.10);
rifle.add(cheek);
// Barrel (long thin cylinder)
const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.6, 8), darkMetalMat);
barrel.rotation.x = Math.PI / 2;
barrel.position.set(0, -0.07, -0.85);
rifle.add(barrel);
// Barrel tip / muzzle
const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 8), darkMetalMat);
muzzle.rotation.x = Math.PI / 2;
muzzle.position.set(0, -0.07, -1.17);
rifle.add(muzzle);
// Scope (mounted on top)
const scopeBody = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 12), darkMetalMat);
scopeBody.rotation.x = Math.PI / 2;
scopeBody.position.set(0, -0.025, -0.40);
rifle.add(scopeBody);
// Scope lens (front)
const lensFront = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 12), accentMat);
lensFront.rotation.x = Math.PI / 2;
lensFront.position.set(0, -0.025, -0.52);
rifle.add(lensFront);
// Scope eyepiece (back)
const lensBack = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.02, 12), accentMat);
lensBack.rotation.x = Math.PI / 2;
lensBack.position.set(0, -0.025, -0.28);
rifle.add(lensBack);
// Scope mounts
const mount1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.04), metalMat);
mount1.position.set(0, -0.06, -0.35);
rifle.add(mount1);
const mount2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.04), metalMat);
mount2.position.set(0, -0.06, -0.45);
rifle.add(mount2);
// Magazine (sticking down)
const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.10, 0.06), accentMat);
mag.position.set(0, -0.18, -0.30);
rifle.add(mag);
// Trigger guard
const guard = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.005, 6, 12, Math.PI), metalMat);
guard.rotation.x = Math.PI / 2;
guard.rotation.z = Math.PI;
guard.position.set(0, -0.13, -0.22);
rifle.add(guard);
// Bipod / foregrip
const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.06), stockMat);
grip.position.set(0, -0.14, -0.20);
rifle.add(grip);
// Front sight
const fSight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.04, 0.02), darkMetalMat);
fSight.position.set(0, -0.02, -1.0);
rifle.add(fSight);

// Position the rifle in the lower-right of the screen
rifle.position.set(0.18, -0.16, 0);
rifle.rotation.y = -0.06;
// Don't let rays hit the rifle
rifle.traverse(o => { o.userData.noShoot = true; });

camera.add(rifle);

// ─── Animation state (mutable; loop & toggleScope read/write these) ───
export const rifleTargetPos  = { x: 0.18, y: -0.16, z: 0 };
export const rifleCurrentPos = { x: 0.18, y: -0.16, z: 0 };
// Recoil scalar lives in a holder so other modules can reset it.
export const rifleRecoil = { offset: 0 };

// Set the rifle's target rest pose (used by toggleScope to drop it off-screen).
export function setRifleTarget(x, y, z){
  rifleTargetPos.x = x;
  rifleTargetPos.y = y;
  rifleTargetPos.z = z;
}

// Per-frame rifle update (called from the main loop).
export function updateRifle(dt, isScoped, breathHold){
  // Animate position smoothly toward target rest pose
  rifleCurrentPos.x += (rifleTargetPos.x - rifleCurrentPos.x) * Math.min(1, dt * 8);
  rifleCurrentPos.y += (rifleTargetPos.y - rifleCurrentPos.y) * Math.min(1, dt * 8);
  rifleCurrentPos.z += (rifleTargetPos.z - rifleCurrentPos.z) * Math.min(1, dt * 8);
  // Recoil decay (exponential)
  rifleRecoil.offset *= Math.pow(0.001, dt);
  if (rifleRecoil.offset < 0.001) rifleRecoil.offset = 0;
  // Subtle bob + breathing sway when not scoped, plus recoil push back
  const bobT = performance.now() / 1000;
  const bobAmt = isScoped ? 0 : 0.004;
  const swayAmtY = isScoped ? 0 : 0.003 * (1 - breathHold);
  rifle.position.x = rifleCurrentPos.x + Math.sin(bobT * 1.7) * bobAmt;
  rifle.position.y = rifleCurrentPos.y + Math.cos(bobT * 2.3) * bobAmt;
  rifle.position.z = rifleCurrentPos.z + rifleRecoil.offset;
  rifle.rotation.x = -rifleRecoil.offset * 0.5 + Math.sin(bobT * 1.1) * swayAmtY;
}
