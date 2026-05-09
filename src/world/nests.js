// ─────── Sniper nest platforms ───────
// Builds the 3D platform mesh for each NEST in state.NESTS and exposes the
// setNest() helper that teleports the camera (with optional fade transition).

import { scene, camera } from '../scene.js';
import { state, NESTS } from '../state.js';

const THREE = window.THREE;

// Index of the nest the player is currently sitting in.
export const nestIdx = { current: 0 };

const nestGroup = new THREE.Group();
scene.add(nestGroup);

const nestMaterials = {
  concrete: new THREE.MeshLambertMaterial({ color: 0x4a4138 }),
  edge:     new THREE.MeshLambertMaterial({ color: 0x2a241c }),
  wall:     new THREE.MeshLambertMaterial({ color: 0x3a3028 }),
  metal:    new THREE.MeshLambertMaterial({ color: 0x5a5048 }),
  pipe:     new THREE.MeshLambertMaterial({ color: 0x4a4038 }),
};

function makeLedge(w, h, d, x, y, z){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), nestMaterials.edge);
  m.position.set(x, y, z);
  return m;
}

function buildNestPlatform(nest){
  const g = new THREE.Group();
  g.position.set(nest.x, nest.y, nest.z);
  const N = 6; // platform half-size

  if (nest.type === 'roof') {
    // Rooftop: large concrete pad with low ledges + AC unit
    const pad = new THREE.Mesh(new THREE.BoxGeometry(N*2, 0.3, N*2), nestMaterials.concrete);
    g.add(pad);
    // Building beneath
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(N*2.1, nest.y, N*2.1),
      nestMaterials.wall
    );
    body.position.y = -nest.y/2 - 0.15;
    g.add(body);
    // Low ledges around 3 sides (leave one side open toward city)
    const ledgeH = 0.6, ledgeT = 0.4;
    [[N*2, ledgeH, ledgeT, 0, ledgeH/2, N],
     [ledgeT, ledgeH, N*2, N, ledgeH/2, 0],
     [ledgeT, ledgeH, N*2, -N, ledgeH/2, 0]].forEach(([w,h,d,x,y,z]) => {
      g.add(makeLedge(w,h,d,x,y,z));
    });
    // AC unit
    const ac = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.2, 1.8), new THREE.MeshLambertMaterial({color:0x6a6058}));
    ac.position.set(-N+2.5, 0.6, -N+2);
    g.add(ac);
  } else if (nest.type === 'garage') {
    // Multi-level parking garage top floor
    const pad = new THREE.Mesh(new THREE.BoxGeometry(N*2.5, 0.3, N*2.5), nestMaterials.concrete);
    g.add(pad);
    // Garage body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(N*2.6, nest.y, N*2.6),
      new THREE.MeshLambertMaterial({color:0x484038})
    );
    body.position.y = -nest.y/2 - 0.15;
    g.add(body);
    // Pillars on roof
    [[-N+1, 0, -N+1], [N-1, 0, -N+1], [-N+1, 0, N-1], [N-1, 0, N-1]].forEach(([x,y,z]) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.5, 0.6), nestMaterials.metal);
      p.position.set(x, y+1.25, z);
      g.add(p);
    });
  } else if (nest.type === 'overpass') {
    // Highway overpass — long thin road segment
    const road = new THREE.Mesh(new THREE.BoxGeometry(N*4, 0.4, N*1.4), nestMaterials.concrete);
    g.add(road);
    // Pillars below
    [[-N*1.5, 0, 0], [0, 0, 0], [N*1.5, 0, 0]].forEach(([x,y,z]) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, nest.y, 8), nestMaterials.wall);
      p.position.set(x, -nest.y/2 - 0.2, z);
      g.add(p);
    });
    // Guardrails
    const rail1 = new THREE.Mesh(new THREE.BoxGeometry(N*4, 0.5, 0.1), nestMaterials.metal);
    rail1.position.set(0, 0.5, N*0.7);
    g.add(rail1);
    const rail2 = new THREE.Mesh(new THREE.BoxGeometry(N*4, 0.5, 0.1), nestMaterials.metal);
    rail2.position.set(0, 0.5, -N*0.7);
    g.add(rail2);
  } else if (nest.type === 'scaffold') {
    // Construction scaffold — metal frame with wood plank floor
    const plank = new THREE.Mesh(new THREE.BoxGeometry(N*1.6, 0.2, N*1.6), new THREE.MeshLambertMaterial({color:0x6a4f30}));
    g.add(plank);
    // Vertical poles
    const corners = [[-N*0.7,-N*0.7],[N*0.7,-N*0.7],[-N*0.7,N*0.7],[N*0.7,N*0.7]];
    corners.forEach(([x,z]) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, nest.y + 4, 6), nestMaterials.metal);
      pole.position.set(x, -nest.y/2 + 2, z);
      g.add(pole);
      // Top extension above platform
      const topExt = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2, 6), nestMaterials.metal);
      topExt.position.set(x, 1, z);
      g.add(topExt);
    });
    // Cross beams
    const beams = [
      [N*1.6, 0.1, 0.1, 0, 0.5, -N*0.7],
      [N*1.6, 0.1, 0.1, 0, 0.5, N*0.7],
      [0.1, 0.1, N*1.6, -N*0.7, 0.5, 0],
      [0.1, 0.1, N*1.6, N*0.7, 0.5, 0],
    ];
    beams.forEach(([w,h,d,x,y,z]) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), nestMaterials.metal);
      b.position.set(x,y,z);
      g.add(b);
    });
  } else if (nest.type === 'street') {
    // Street corner — concrete pad behind a low wall (like a checkpoint)
    const pad = new THREE.Mesh(new THREE.BoxGeometry(N*2, 0.2, N*2), nestMaterials.concrete);
    g.add(pad);
    // Low concrete barrier (T-wall style) front + sides
    const barFront = new THREE.Mesh(new THREE.BoxGeometry(N*2, 1.4, 0.4), nestMaterials.wall);
    barFront.position.set(0, 0.7, N*0.9);
    g.add(barFront);
    const barLeft = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.4, N*1.2), nestMaterials.wall);
    barLeft.position.set(-N*0.9, 0.7, N*0.3);
    g.add(barLeft);
    const barRight = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.4, N*1.2), nestMaterials.wall);
    barRight.position.set(N*0.9, 0.7, N*0.3);
    g.add(barRight);
    // Sandbags
    for (let i = 0; i < 5; i++) {
      const sb = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.4), new THREE.MeshLambertMaterial({color:0x6a5640}));
      sb.position.set(-N*0.9 + i*0.65, 1.55, N*0.7);
      g.add(sb);
    }
  }

  // Mark the whole nest as non-shootable
  g.traverse(o => { o.userData.noShoot = true; });
  nestGroup.add(g);
  return g;
}

export function buildAllNests(){
  NESTS.forEach(buildNestPlatform);
}

// Optional callback that fires after a nest change. main.js wires this to
// hud.updateMinimap() so the label/arrow refresh immediately after a teleport.
let onNestChange = () => {};
export function setOnNestChange(cb){ onNestChange = cb; }

// Move the player to nest `idx`. When `smooth` is true, fades to black via the
// CSS overlay before warping.
export function setNest(idx, smooth = false){
  nestIdx.current = idx;
  const n = NESTS[idx];
  if (smooth) {
    const fader = document.getElementById('fader');
    fader.classList.add('show');
    setTimeout(() => {
      camera.position.set(n.x, n.y + 1.7, n.z);
      state.yaw = n.yaw;
      state.pitch = 0;
      setTimeout(() => {
        fader.classList.remove('show');
      }, 60);
    }, 220);
  } else {
    camera.position.set(n.x, n.y + 1.7, n.z);
    state.yaw = n.yaw;
    state.pitch = 0;
  }
  onNestChange();
}
