// ─────── Particle pool & hit FX ───────
// Recycles a single SphereGeometry across all hit/dust particles. spawnHitFx
// and spawnDustFx push live particles into the shared `particles` array; the
// loop steps them forward and releases dead ones.

import { scene } from '../scene.js';

const THREE = window.THREE;

const PARTICLE_GEO = new THREE.SphereGeometry(0.08, 4, 4);
const particlePool = [];

export function getParticle(color){
  let p = particlePool.pop();
  if (!p) {
    p = new THREE.Mesh(
      PARTICLE_GEO,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, fog: false })
    );
  } else {
    p.material.color.set(color);
    p.material.opacity = 1;
    p.visible = true;
  }
  return p;
}

export function releaseParticle(p){
  p.visible = false;
  if (p.parent) p.parent.remove(p);
  particlePool.push(p);
}

// Live particles. Each entry: { mesh, vx, vy, vz, life }.
export const particles = [];

// Counts dropped from 16/10 to 10/6 to cut per-shot allocation cost & GPU draws.
export function spawnHitFx(pos, head, type){
  const count = head ? 10 : 6;
  const color = head ? 0xff4030 : (type === 'drone' ? 0x888888 : 0xa83c2a);
  for (let i = 0; i < count; i++) {
    const p = getParticle(color);
    p.position.copy(pos);
    scene.add(p);
    particles.push({
      mesh: p,
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3 + 1,
      vz: (Math.random() - 0.5) * 4,
      life: 1.2,
    });
  }
}

export function spawnDustFx(pos){
  for (let i = 0; i < 4; i++) {
    const p = getParticle(0xa89968);
    p.material.opacity = 0.8;
    p.position.copy(pos);
    scene.add(p);
    particles.push({
      mesh: p,
      vx: (Math.random() - 0.5) * 2,
      vy: Math.random() * 1.5,
      vz: (Math.random() - 0.5) * 2,
      life: 0.8,
    });
  }
}

// Advance all live particles. Drops dead ones back into the pool.
export function updateParticles(dt){
  for (const p of particles) {
    p.life -= dt;
    p.vy -= 9.8 * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.mesh.material.opacity = Math.max(0, p.life);
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].life <= 0) {
      releaseParticle(particles[i].mesh);
      particles.splice(i, 1);
    }
  }
}
