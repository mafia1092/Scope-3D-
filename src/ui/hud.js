// ─────── HUD: ammo, score, compass, labels, minimap, dossier, cinematic ───────
// Also owns the player actions that touch every layer (fire, startReload,
// finishReload, toggleScope) since they cross input → entities → fx → hud.

import { camera, canvas, updateCameraFov } from '../scene.js';
import {
  state, cine, NESTS, CONTRACTS, MINI_SCALE, FOV_NORMAL,
} from '../state.js';
import { rifleRecoil, setRifleTarget } from '../entities/rifle.js';
import { spawnHitFx, spawnDustFx } from '../entities/fx.js';
import {
  targets, hitables, animateDeath, rebuildHitables,
} from '../entities/targets.js';
import { buildingPositions } from '../world/city.js';
import { nestIdx, setNest } from '../world/nests.js';

const THREE = window.THREE;

// ─── DOM refs (looked up once at module init) ───
const scopeOverlay  = document.getElementById('scope');
const crosshairMin  = document.getElementById('crosshairMin');
const breathFill    = document.getElementById('breathFill');
const breathLabel   = document.getElementById('breathLabel');
const flash         = document.getElementById('flash');
const zoomSlider    = document.getElementById('zoomSlider');
const compassStrip  = document.getElementById('compassStrip');
const fireBtn       = document.getElementById('fireBtn');
const reloadBtn     = document.getElementById('reloadBtn');

// Minimap canvas (also used as a tap surface for nest jumps)
const miniCanvas = document.getElementById('minimapCanvas');
const miniCtx    = miniCanvas.getContext('2d');

// Target labels container & object pool
const labelsContainer = document.getElementById('targetLabels');
const labelPool = [];

// ─── Reusable raycaster (one shot per fire) + reused direction Vector3 ───
const raycaster = new THREE.Raycaster();
const _fireDir = new THREE.Vector3();

// ─────── Player actions ───────
export function fire(){
  if (!state.gameplayActive || cine.active) return;
  if (state.ammo <= 0 || state.reloading) return;
  state.ammo--;

  // Restart CSS animations without forcing a layout (offsetWidth thrash).
  // Removing then re-adding in the next microtask is enough on modern browsers.
  flash.classList.remove('fire');
  canvas.classList.remove('recoil');
  requestAnimationFrame(() => {
    flash.classList.add('fire');
    canvas.classList.add('recoil');
  });
  // Rifle recoil
  rifleRecoil.offset = 0.08;
  // Haptic kick on fire
  navigator.vibrate?.(15);

  // Direction: camera forward + sway
  const swayBase = state.isScoped ? (1 - state.breathHold) * 0.04 : 0.07;
  const t = performance.now() / 1000;
  const swayX = (Math.sin(t * 1.4) + Math.sin(t * 3.1) * 0.3) * swayBase;
  const swayY = (Math.cos(t * 1.1) * 0.7 + Math.cos(t * 2.7) * 0.3) * swayBase;

  _fireDir.set(swayX, swayY, -1).normalize().applyQuaternion(camera.quaternion);

  raycaster.set(camera.position, _fireDir);
  raycaster.far = 1000;

  if (hitables.dirty || !hitables.cache) rebuildHitables();
  const hits = raycaster.intersectObjects(hitables.cache, false);
  if (hits.length > 0) {
    const h = hits[0];
    const target = h.object.userData.targetRef;
    if (target && target.alive) {
      // headshot check: did we hit the head ref?
      let isHead = false;
      let m = h.object;
      while (m) {
        if (m === target.mesh.userData.headRef) { isHead = true; break; }
        if (m === target.mesh) break;
        m = m.parent;
      }
      // For drones, headshot = hit at all (always body)
      if (target.type === 'drone') isHead = false;

      target.alive = false;
      const pts = isHead ? 250 : (target.type === 'drone' ? 200 : 100);
      state.score += pts;
      state.kills++;
      if (isHead) {
        state.headshots++;
        navigator.vibrate?.([20, 30, 25]);
      }

      spawnHitFx(h.point, isHead, target.type);
      animateDeath(target, isHead);
      showHitText(
        h.point,
        isHead ? 'HEADSHOT +250' : (target.type === 'drone' ? 'DRONE +200' : '+100'),
        isHead ? 'var(--rust)' : 'var(--gold)'
      );
    } else {
      // hit a building — show puff
      spawnDustFx(h.point);
    }
  }
  updateHud();
}

export function startReload(){
  if (state.reloading) return;
  if (state.ammo === state.magSize) return;
  if (state.reserveAmmo <= 0) return;
  state.reloading = true;
  state.reloadStart = performance.now();
  reloadBtn.classList.add('reloading');
  reloadBtn.textContent = '...';
}

export function finishReload(){
  const need = state.magSize - state.ammo;
  const give = Math.min(need, state.reserveAmmo);
  state.ammo += give;
  state.reserveAmmo -= give;
  state.reloading = false;
  reloadBtn.classList.remove('reloading');
  reloadBtn.textContent = 'RELOAD';
  reloadBtn.style.removeProperty('--rp');
  updateHud();
}

export function toggleScope(){
  if (cine.active) return;
  state.isScoped = !state.isScoped;
  scopeOverlay.classList.toggle('on', state.isScoped);
  document.getElementById('scopeBtn').classList.toggle('active', state.isScoped);
  crosshairMin.classList.toggle('hidden', state.isScoped);
  zoomSlider.classList.toggle('disabled', !state.isScoped);
  if (state.isScoped) zoomSlider.classList.add('active');
  else { zoomSlider.classList.remove('active'); state.breathHold = 0; }
  // Move rifle off-screen when scoped, back into view when not
  if (state.isScoped) setRifleTarget(0.18, -1.5, 0);
  else                setRifleTarget(0.18, -0.16, 0);
  updateCameraFov();
}

// ─── Hit text floats up briefly above the impact point ───
// Pooled DOM elements (bounded at 12) + reused Vector3 to avoid per-shot
// allocation/GC churn under sustained firing.
const HIT_TEXT_POOL = [];
const HIT_TEXT_POOL_MAX = 12;
const _hitTmpV = new THREE.Vector3();
function _acquireHitTextEl(){
  for (const e of HIT_TEXT_POOL) {
    if (!e._inUse) return e;
  }
  if (HIT_TEXT_POOL.length < HIT_TEXT_POOL_MAX) {
    const el = document.createElement('div');
    el.className = 'hit-text';
    document.body.appendChild(el);
    HIT_TEXT_POOL.push(el);
    return el;
  }
  // Pool full — recycle the oldest in-use element
  const el = HIT_TEXT_POOL[0];
  el.classList.remove('show');
  return el;
}
function showHitText(worldPos, text, color){
  _hitTmpV.copy(worldPos).project(camera);
  if (_hitTmpV.z > 1) return;
  const sx = (_hitTmpV.x * 0.5 + 0.5) * window.innerWidth;
  const sy = (-_hitTmpV.y * 0.5 + 0.5) * window.innerHeight;
  const el = _acquireHitTextEl();
  el._inUse = true;
  el.classList.remove('show');
  el.style.left = sx + 'px';
  el.style.top  = sy + 'px';
  el.style.color = color;
  el.textContent = text;
  requestAnimationFrame(() => el.classList.add('show'));
  if (el._timeout) clearTimeout(el._timeout);
  el._timeout = setTimeout(() => {
    el.classList.remove('show');
    el._inUse = false;
  }, 1000);
}

// ─────── HUD updates ───────
export function updateHud(){
  document.getElementById('targetsLeft').textContent =
    state.kills + '/' + targets.length;
  document.getElementById('score').textContent = state.score;
  const ammoLine = document.getElementById('ammoLine');
  ammoLine.textContent = state.ammo + ' / ' + state.reserveAmmo;
  ammoLine.classList.toggle('low', state.ammo <= 2);
  fireBtn.disabled   = state.ammo <= 0 || state.reloading;
  reloadBtn.disabled = state.reloading || state.ammo === state.magSize || state.reserveAmmo <= 0;
}

// ─────── Compass ───────
export function buildCompass(){
  const dirs = ['N','NE','E','SE','S','SW','W','NW','N','NE','E','SE','S','SW','W','NW','N'];
  const STRIP_PX = 360 * 4; // 4px per degree
  compassStrip.style.width = STRIP_PX + 'px';
  let inner = '';
  for (let d = 0; d <= 360; d += 15) {
    const lbl = (d % 45 === 0) ? dirs[Math.floor(d / 45)] : '·';
    const px = (d / 360) * STRIP_PX;
    inner += `<span style="position:absolute;left:${px}px;top:50%;transform:translate(-50%,-50%);">${lbl}</span>`;
  }
  compassStrip.innerHTML = inner;
}

export function updateCompass(){
  let deg = (state.yaw * 180 / Math.PI) % 360;
  if (deg < 0) deg += 360;
  const STRIP_PX = 360 * 4;
  const cw = 160; // compass width
  const offset = (deg / 360) * STRIP_PX - cw / 2;
  compassStrip.style.transform = `translateX(${-offset}px)`;
}

// ─────── Target labels ───────
function getLabelNode(){
  let n = labelPool.find(x => !x._inUse);
  if (!n) {
    n = document.createElement('div');
    n.className = 'tgt-label';
    n.innerHTML = '<div class="marker"></div><div class="name"></div><div class="dist"></div>';
    labelsContainer.appendChild(n);
    labelPool.push(n);
  }
  n._inUse = true;
  n.style.display = '';
  return n;
}

function releaseUnusedLabels(){
  for (const n of labelPool) {
    if (!n._touched) { n.style.display = 'none'; n._inUse = false; }
    n._touched = false;
  }
}

// Reusable Vector3 for label projection — was allocated per-target per-call
const _labelTmpV = new THREE.Vector3();
const _labelCandidates = [];
const MAX_LABELS_SCOPED = 6; // cap label count when scoped to keep DOM cheap

export function updateTargetLabels(){
  if (!labelsContainer) return; // not yet initialized
  if (!state.gameplayActive) {
    labelPool.forEach(n => { n.style.display = 'none'; n._inUse = false; });
    return;
  }

  // Build candidate list: contracts always; generics only when scoped, capped.
  _labelCandidates.length = 0;
  for (const t of targets) {
    if (!t.alive || t.dying || t.removed) continue;
    const isContract = t.isContract;
    if (!isContract && !state.isScoped) continue;
    const dx = t.mesh.position.x - camera.position.x;
    const dy = t.mesh.position.y - camera.position.y;
    const dz = t.mesh.position.z - camera.position.z;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (dist > 250) continue;
    _labelCandidates.push({ t, dist, isContract });
  }
  // When scoped, keep contracts + the 6 closest generics (was uncapped — could
  // hit ~12 DOM labels at once, which made scoped mode noticeably heavier).
  if (state.isScoped) {
    _labelCandidates.sort((a, b) => {
      if (a.isContract !== b.isContract) return a.isContract ? -1 : 1;
      return a.dist - b.dist;
    });
    let allowed = 0;
    const trimmed = [];
    for (const c of _labelCandidates) {
      if (c.isContract) { trimmed.push(c); continue; }
      if (allowed < MAX_LABELS_SCOPED) { trimmed.push(c); allowed++; }
    }
    _labelCandidates.length = 0;
    for (const c of trimmed) _labelCandidates.push(c);
  }

  for (const { t, dist, isContract } of _labelCandidates) {
    _labelTmpV.set(t.mesh.position.x, t.mesh.position.y + 3.2, t.mesh.position.z);
    _labelTmpV.project(camera);
    if (_labelTmpV.z > 1) continue;
    if (_labelTmpV.x < -1.1 || _labelTmpV.x > 1.1 || _labelTmpV.y < -1.1 || _labelTmpV.y > 1.1) continue;

    const sx = (_labelTmpV.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-_labelTmpV.y * 0.5 + 0.5) * window.innerHeight;

    const node = getLabelNode();
    node._touched = true;
    const cls = isContract ? 'contract' : (t.targetKind || 'soldier');
    node.className = 'tgt-label ' + cls;
    node.style.left = sx + 'px';
    node.style.top  = sy + 'px';

    const marker = node.children[0];
    const name   = node.children[1];
    const distEl = node.children[2];

    if (isContract) {
      marker.textContent = '◆';
      name.textContent = t.alias;
      distEl.textContent = Math.round(dist) + 'm · $' + t.bounty;
    } else {
      marker.textContent = t.targetKind === 'civilian' ? '◇' : '·';
      name.textContent = t.kindLabel;
      distEl.textContent = Math.round(dist) + 'm';
    }
  }
  releaseUnusedLabels();
}

// ─────── Minimap ───────
function worldToMini(wx, wz){
  return {
    x: miniCanvas.width  / 2 + wx * MINI_SCALE,
    y: miniCanvas.height / 2 + wz * MINI_SCALE,
  };
}

export function updateMinimap(){
  if (!miniCtx) return;
  const w = miniCanvas.width, h = miniCanvas.height;
  miniCtx.clearRect(0, 0, w, h);
  // Background
  miniCtx.fillStyle = '#0a0d12';
  miniCtx.fillRect(0, 0, w, h);
  // Faint grid
  miniCtx.strokeStyle = 'rgba(212,200,150,0.08)';
  miniCtx.lineWidth = 1;
  for (let i = 1; i < 8; i++) {
    miniCtx.beginPath();
    miniCtx.moveTo((w/8)*i, 0); miniCtx.lineTo((w/8)*i, h);
    miniCtx.moveTo(0, (h/8)*i); miniCtx.lineTo(w, (h/8)*i);
    miniCtx.stroke();
  }
  // N marker at top
  miniCtx.fillStyle = 'rgba(212,200,150,0.5)';
  miniCtx.font = 'bold 10px Anton, sans-serif';
  miniCtx.textAlign = 'center';
  miniCtx.fillText('N', w/2, 9);

  // City buildings as faint rectangles
  miniCtx.fillStyle = 'rgba(80,80,90,0.35)';
  for (const b of buildingPositions) {
    const p = worldToMini(b.x, b.z);
    const sx = b.w * MINI_SCALE * 0.8;
    const sz = b.d * MINI_SCALE * 0.8;
    miniCtx.fillRect(p.x - sx/2, p.y - sz/2, sx, sz);
  }

  // Targets — contracts as red, others faint. Skip dead/removed.
  for (const t of targets) {
    if (!t.alive || t.removed) continue;
    const p = worldToMini(t.mesh.position.x, t.mesh.position.z);
    if (t.isContract) {
      miniCtx.fillStyle = '#d94a3d';
      miniCtx.beginPath();
      miniCtx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      miniCtx.fill();
      // Pulsing ring
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
      miniCtx.strokeStyle = `rgba(217,74,61,${0.6 - pulse * 0.4})`;
      miniCtx.lineWidth = 1;
      miniCtx.beginPath();
      miniCtx.arc(p.x, p.y, 3 + pulse * 4, 0, Math.PI * 2);
      miniCtx.stroke();
    } else if (t.targetKind === 'civilian') {
      miniCtx.fillStyle = 'rgba(106,191,125,0.7)';
      miniCtx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    } else if (t.targetKind === 'drone') {
      miniCtx.fillStyle = 'rgba(158,197,232,0.6)';
      miniCtx.fillRect(p.x - 1, p.y - 1, 2, 2);
    } else {
      miniCtx.fillStyle = 'rgba(200,176,112,0.55)';
      miniCtx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
  }

  // Nests — gold diamonds; current nest highlighted
  NESTS.forEach((n, i) => {
    const p = worldToMini(n.x, n.z);
    const isCurrent = i === nestIdx.current;
    miniCtx.save();
    miniCtx.translate(p.x, p.y);
    miniCtx.rotate(Math.PI / 4);
    const size = isCurrent ? 6 : 5;
    miniCtx.fillStyle = isCurrent ? '#f0b429' : '#7a6a3a';
    miniCtx.fillRect(-size/2, -size/2, size, size);
    miniCtx.strokeStyle = isCurrent ? '#fff5d8' : '#3a3020';
    miniCtx.lineWidth = 1;
    miniCtx.strokeRect(-size/2, -size/2, size, size);
    miniCtx.restore();
    // Nest number
    miniCtx.fillStyle = isCurrent ? '#0a0d12' : 'rgba(212,200,150,0.7)';
    miniCtx.font = 'bold 8px Anton, sans-serif';
    miniCtx.textAlign = 'center';
    miniCtx.textBaseline = 'middle';
    miniCtx.fillText(String(i + 1), p.x, p.y + 0.5);
  });

  // Current heading: small arrow at current nest pointing where camera faces
  if (NESTS[nestIdx.current]) {
    const n = NESTS[nestIdx.current];
    const p = worldToMini(n.x, n.z);
    const dx = -Math.sin(state.yaw);
    const dz = -Math.cos(state.yaw);
    const tipX = p.x + dx * 14;
    const tipY = p.y + dz * 14;
    miniCtx.strokeStyle = 'rgba(240,180,41,0.85)';
    miniCtx.lineWidth = 1.5;
    miniCtx.beginPath();
    miniCtx.moveTo(p.x, p.y);
    miniCtx.lineTo(tipX, tipY);
    miniCtx.stroke();
    // arrowhead
    miniCtx.fillStyle = 'rgba(240,180,41,0.9)';
    miniCtx.beginPath();
    miniCtx.moveTo(tipX, tipY);
    miniCtx.lineTo(tipX - dx*5 + dz*3, tipY - dz*5 - dx*3);
    miniCtx.lineTo(tipX - dx*5 - dz*3, tipY - dz*5 + dx*3);
    miniCtx.closePath();
    miniCtx.fill();
  }

  // Update current nest label
  document.getElementById('minimapCurrent').textContent = '— ' + NESTS[nestIdx.current].name + ' —';
}

// ─── Tap-to-jump on minimap ───
function pickNestAt(cx, cy){
  let best = -1, bestD = 18; // min hit radius in canvas px
  NESTS.forEach((n, i) => {
    const p = worldToMini(n.x, n.z);
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d < bestD) { bestD = d; best = i; }
  });
  if (best >= 0 && best !== nestIdx.current) {
    document.getElementById('minimapHint').style.display = 'none';
    setNest(best, true);
  }
}

export function bindMinimapInput(){
  miniCanvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (cine.active) return;
    const rect = miniCanvas.getBoundingClientRect();
    const t = e.changedTouches[0];
    const cx = (t.clientX - rect.left) * (miniCanvas.width / rect.width);
    const cy = (t.clientY - rect.top)  * (miniCanvas.height / rect.height);
    pickNestAt(cx, cy);
  }, { passive: false });
  miniCanvas.addEventListener('mousedown', e => {
    if (cine.active) return;
    const rect = miniCanvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (miniCanvas.width / rect.width);
    const cy = (e.clientY - rect.top)  * (miniCanvas.height / rect.height);
    pickNestAt(cx, cy);
  });
}

// ─────── Dossier population (mission briefing list) ───────
export function populateDossier(){
  const list = document.getElementById('dossierList');
  list.innerHTML = '';
  CONTRACTS.forEach((c, i) => {
    const card = document.createElement('div');
    card.className = 'dossier-card';
    card.innerHTML = `
      <div class="icon">${i + 1}</div>
      <div class="info">
        <div class="name">${c.alias}</div>
        <div class="real">${c.real}</div>
        <div class="bio">${c.bio}</div>
      </div>
      <div class="bounty">$${c.bounty}</div>
    `;
    list.appendChild(card);
  });
}

// ─────── Cinematic intro ───────
function aimCameraAt(targetMesh, durationMs){
  return new Promise(resolve => {
    const c = camera;
    const tg = targetMesh;
    const dx = tg.position.x - c.position.x;
    const dy = (tg.position.y + 1.2) - c.position.y;
    const dz = tg.position.z - c.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    const targetYaw = Math.atan2(-dx, -dz);
    const targetPitch = Math.atan2(dy, dist);
    const startYaw = state.yaw;
    const startPitch = state.pitch;
    // Shortest angular path for yaw
    let dyaw = targetYaw - startYaw;
    while (dyaw > Math.PI)  dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;

    const startFov = camera.fov;
    const targetFov = 30; // closer in for dramatic effect

    const start = performance.now();
    function step(){
      if (cine.skipped) { resolve(); return; }
      const t2 = (performance.now() - start) / durationMs;
      const k = Math.min(1, t2);
      const e = k < 0.5 ? 2*k*k : 1 - Math.pow(-2*k + 2, 2) / 2;
      state.yaw   = startYaw   + dyaw * e;
      state.pitch = startPitch + (targetPitch - startPitch) * e;
      camera.fov  = startFov   + (targetFov   - startFov)   * e;
      camera.updateProjectionMatrix();
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    }
    step();
  });
}

function showCineCard(idx){
  const c = CONTRACTS[idx];
  document.getElementById('cineLabel').textContent   = `TARGET ${idx + 1} / ${CONTRACTS.length}`;
  document.getElementById('cineName').textContent    = c.alias;
  document.getElementById('cineReal').textContent    = c.real;
  document.getElementById('cineBio').textContent     = c.bio;
  document.getElementById('cineBounty').textContent  = `BOUNTY · $${c.bounty}`;
}

export async function runCinematicIntro(){
  if (cine.active) return;

  // Honor prefers-reduced-motion: skip cinematic, jump straight to gameplay
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    cine.skipped = true;
    cine.active = false;
    camera.fov = FOV_NORMAL;
    camera.updateProjectionMatrix();
    state.pitch = 0;
    state.yaw = 0;
    document.getElementById('cineOverlay')?.classList.remove('show');
    state.gameplayActive = true;
    return;
  }

  cine.active = true;
  cine.skipped = false;
  document.getElementById('cineOverlay').classList.add('show');

  // Find contract targets
  const contractTargets = targets.filter(t => t.isContract);
  for (let i = 0; i < contractTargets.length && !cine.skipped; i++) {
    showCineCard(contractTargets[i].contractIdx);
    // Slow pan to this target (~1.5s)
    await aimCameraAt(contractTargets[i].mesh, 1500);
    if (cine.skipped) break;
    // Hold for ~1.5s
    await new Promise(r => setTimeout(r, 1500));
  }

  // Reset FOV to gameplay default
  camera.fov = FOV_NORMAL;
  camera.updateProjectionMatrix();
  state.pitch = 0;
  state.yaw = 0;
  document.getElementById('cineOverlay').classList.remove('show');
  cine.active = false;
  cine.skipped = false;
  state.gameplayActive = true;
}

export function bindCineSkip(){
  document.getElementById('cineSkip').addEventListener('click', () => {
    cine.skipped = true;
  });
}

// ─── Steady scope cue (read by loop after breath update) ───
export function setSteadyState(steady){
  if (steady) scopeOverlay.classList.add('steady');
  else        scopeOverlay.classList.remove('steady');
  breathFill.style.width = (state.breathHold * 100) + '%';
  breathLabel.textContent = state.breathHold > 0.7 ? 'STEADY' : 'BREATH';
  breathLabel.classList.toggle('holding', state.breathHold > 0.7);
}

// ─── Reload progress ring (read by loop while reloading) ───
export function tickReload(){
  if (!state.reloading) return;
  const elapsed = performance.now() - state.reloadStart;
  const pct = Math.min(1, elapsed / state.reloadDuration);
  reloadBtn.style.setProperty('--rp', (pct * 100) + '%');
  if (pct >= 1) finishReload();
}

