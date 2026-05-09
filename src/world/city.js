// ─────── City: ring of buildings, streets, ground plane ───────
// Builds the city geometry once at boot. Materials are pooled per base color
// (one MeshLambertMaterial + canvas texture per color, reused across faces).
// Exports buildingPositions for target placement / minimap rendering.

import { scene } from '../scene.js';
import { NESTS, rand } from '../state.js';

const THREE = window.THREE;

export const cityGroup = new THREE.Group();
scene.add(cityGroup);

// {x, z, w, d, h, top} — used by targets.spawnTargets and ui.updateMinimap
export const buildingPositions = [];

// Cache textures by base color (one canvas texture per color, all faces share)
const textureCache = new Map();
function makeWindowTexture(_faceW, _faceH, baseColor){
  const key = baseColor;
  if (textureCache.has(key)) return textureCache.get(key);

  const canv = document.createElement('canvas');
  canv.width = 128; canv.height = 256;
  const ctx2 = canv.getContext('2d');
  // base color
  ctx2.fillStyle = '#' + baseColor.toString(16).padStart(6, '0');
  ctx2.fillRect(0, 0, canv.width, canv.height);
  // subtle noise
  for (let i = 0; i < 200; i++) {
    ctx2.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
    ctx2.fillRect(Math.random() * canv.width, Math.random() * canv.height, 1, 1);
  }
  // windows grid — fixed grid since the texture is now shared
  const cols = 5;
  const rows = 12;
  const cellW = canv.width / cols;
  const cellH = canv.height / rows;
  const winW = cellW * 0.55;
  const winH = cellH * 0.65;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = Math.random() < 0.55;
      const x = c * cellW + (cellW - winW) / 2;
      const y = r * cellH + (cellH - winH) / 2;
      if (lit) {
        const tones = ['#ffe49a', '#ffd070', '#ffc55a', '#ffe89c', '#ffaa55'];
        ctx2.fillStyle = tones[Math.floor(Math.random() * tones.length)];
        ctx2.fillRect(x, y, winW, winH);
        // window frame
        ctx2.fillStyle = 'rgba(0,0,0,0.4)';
        ctx2.fillRect(x, y, winW, 1);
        ctx2.fillRect(x, y + winH - 1, winW, 1);
        ctx2.fillRect(x + winW / 2 - 0.5, y, 1, winH);
      } else {
        ctx2.fillStyle = '#0a0a14';
        ctx2.fillRect(x, y, winW, winH);
      }
    }
  }
  // edge shadow
  const grad = ctx2.createLinearGradient(0, canv.height - 20, 0, canv.height);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx2.fillStyle = grad;
  ctx2.fillRect(0, canv.height - 20, canv.width, 20);

  const tex = new THREE.CanvasTexture(canv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = 2;
  textureCache.set(key, tex);
  return tex;
}

export function buildCity(){
  const colors = [0x3a4452, 0x4a4038, 0x2a3540, 0x4e3a30, 0x3a3a45, 0x554a40, 0x383848];

  // ─── Shared per-color material pool ───
  // One MeshLambertMaterial per baseColor (with windows baked into the texture).
  const materialPool = new Map();
  const sharedTopMat    = new THREE.MeshLambertMaterial({ color: 0x1a1a20 });
  const sharedBottomMat = new THREE.MeshLambertMaterial({ color: 0x0a0a10 });
  function getBuildingMaterials(baseColor){
    let entry = materialPool.get(baseColor);
    if (entry) return entry;
    const tex = makeWindowTexture(0, 0, baseColor);
    const wallMat = new THREE.MeshLambertMaterial({ map: tex });
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z
    entry = [wallMat, wallMat, sharedTopMat, sharedBottomMat, wallMat, wallMat];
    materialPool.set(baseColor, entry);
    return entry;
  }

  // 3 rings (reduced again from 14/18/22 → 10/14/18 — fewer draw calls,
  // still plenty of skyline silhouette since outer ring distances are large)
  const rings = [
    { count: 10, rDist: 70,  hMin: 30, hMax: 80,  wMin: 10, wMax: 16 },
    { count: 14, rDist: 130, hMin: 40, hMax: 110, wMin: 12, wMax: 20 },
    { count: 18, rDist: 200, hMin: 50, hMax: 140, wMin: 14, wMax: 24 },
  ];

  rings.forEach(ring => {
    for (let i = 0; i < ring.count; i++) {
      const angle = (i / ring.count) * Math.PI * 2 + rand(-0.08, 0.08);
      const dist = ring.rDist + rand(-10, 10);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      // Skip if too close to any nest
      let tooClose = false;
      for (const n of NESTS) {
        if (Math.hypot(n.x - x, n.z - z) < 18) { tooClose = true; break; }
      }
      if (tooClose) continue;

      const w = rand(ring.wMin, ring.wMax);
      const d = rand(ring.wMin, ring.wMax);
      const h = rand(ring.hMin, ring.hMax);
      const color = colors[Math.floor(Math.random() * colors.length)];

      const materials = getBuildingMaterials(color);

      const bldg = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        materials
      );
      bldg.position.set(x, h / 2, z);
      cityGroup.add(bldg);

      buildingPositions.push({ x, z, w, d, h, top: h });
    }
  });
}

// ─── Ground plane + street grid ───
export function buildGround(){
  const groundGeo = new THREE.PlaneGeometry(2000, 2000);
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x2a2418 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  scene.add(ground);

  // Streets — simple grid lines
  const streetMat = new THREE.MeshBasicMaterial({ color: 0x1a1610 });
  for (let i = -4; i <= 4; i++) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(8, 800), streetMat);
    v.rotation.x = -Math.PI / 2;
    v.position.set(i * 60, 0.05, 0);
    scene.add(v);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(800, 8), streetMat);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.05, i * 60);
    scene.add(h);
  }
}
