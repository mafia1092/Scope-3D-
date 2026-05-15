// ─────── Input: joysticks, buttons, zoom slider, keyboard, mouse, wheel ───────
// Joystick state lives here as a named export; the main loop reads it each
// frame. Button handlers delegate to the player actions in ui/hud.js.

import { canvas, camera, updateCameraFov } from './scene.js';
import { state, ZOOM_MIN, ZOOM_MAX } from './state.js';
import { fire, startReload, toggleScope } from './ui/hud.js';

// Stick input is mutable & read by the loop each frame.
export const lookInput = { x: 0, y: 0 };
export const aimInput  = { x: 0, y: 0 };

// ─────── Joysticks ───────
function setupStick(zoneId, baseId, knobId, onChange){
  const zone = document.getElementById(zoneId);
  const base = document.getElementById(baseId);
  const knob = document.getElementById(knobId);
  let activeId = null, center = null;
  const radius = 50;

  function start(id, x, y){
    activeId = id; center = { x, y };
    base.style.left = x + 'px'; base.style.top = y + 'px';
    base.classList.add('active');
    knob.style.transform = 'translate(-50%,-50%)';
    onChange(0, 0);
  }
  function move(x, y){
    if (activeId === null) return;
    let dx = x - center.x, dy = y - center.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > radius) { dx = dx / dist * radius; dy = dy / dist * radius; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    onChange(dx / radius, dy / radius);
  }
  function end(){
    activeId = null;
    base.classList.remove('active');
    knob.style.transform = 'translate(-50%,-50%)';
    onChange(0, 0);
  }

  zone.addEventListener('touchstart', e => {
    if (activeId !== null) return;
    const t = e.changedTouches[0];
    e.preventDefault();
    start(t.identifier, t.clientX, t.clientY);
  }, { passive: false });
  window.addEventListener('touchmove', e => {
    if (activeId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier === activeId) { e.preventDefault(); move(t.clientX, t.clientY); }
    }
  }, { passive: false });
  function onEnd(e){
    if (activeId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier === activeId) { end(); }
    }
  }
  window.addEventListener('touchend', onEnd, { passive: false });
  window.addEventListener('touchcancel', onEnd, { passive: false });
  zone.addEventListener('mousedown', e => {
    if (activeId !== null) return;
    start('mouse', e.clientX, e.clientY);
  });
  window.addEventListener('mousemove', e => {
    if (activeId === 'mouse') move(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', () => { if (activeId === 'mouse') end(); });
}

// ─────── Zoom slider ───────
const zoomSlider  = document.getElementById('zoomSlider');
const zoomTrack   = document.getElementById('zoomTrack');
const zoomFill    = document.getElementById('zoomFill');
const zoomKnob    = document.getElementById('zoomKnob');
const zoomVal     = document.getElementById('zoomVal');
const zoomReadout = document.getElementById('zoomReadout');

function setZoomFromY(clientY){
  const r = zoomTrack.getBoundingClientRect();
  let pct = 1 - (clientY - r.top) / r.height;
  pct = Math.max(0, Math.min(1, pct));
  state.zoom = ZOOM_MIN + pct * (ZOOM_MAX - ZOOM_MIN);
  updateZoomUI();
  updateCameraFov();
}

export function updateZoomUI(){
  const pct = (state.zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN);
  zoomFill.style.height = (pct * 100) + '%';
  zoomKnob.style.bottom = (pct * 100) + '%';
  zoomVal.textContent     = state.zoom.toFixed(1) + '×';
  zoomReadout.textContent = '×' + state.zoom.toFixed(1);
}

// ─────── Keyboard state ───────
const keys = Object.create(null);
let _kbActive = false;

// Desktop = PC. WASD here moves the camera (free-walk first person)
// instead of adjusting look angles. Mouse handles look via pointer lock.
const IS_DESKTOP = !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const EYE_HEIGHT  = 1.7;
const WALK_SPEED  = 7;
const SPRINT_MULT = 1.8;

export function readKeyboardInput(){
  // On desktop, WASD/arrows move the player (handled by applyKeyboardMovement).
  // No keyboard look — mouse via pointer lock takes care of that.
  if (IS_DESKTOP) {
    if (_kbActive) { lookInput.x = 0; lookInput.y = 0; _kbActive = false; }
    return;
  }
  // Mobile (rare keyboard case): keep the old "WASD-as-look" behavior.
  const lx = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0);
  const ly = (keys['KeyS'] || keys['ArrowDown']  ? 1 : 0) - (keys['KeyW'] || keys['ArrowUp']   ? 1 : 0);
  if (lx || ly) {
    lookInput.x = lx; lookInput.y = ly;
    _kbActive = true;
  } else if (_kbActive) {
    lookInput.x = 0; lookInput.y = 0;
    _kbActive = false;
  }
}

// PC only: translate the camera horizontally based on WASD/arrows + Shift to sprint.
// Camera Y stays locked to eye level once the player starts walking, so teleporting
// to a nest works for one beat — first WASD press drops you to ground level.
export function applyKeyboardMovement(dt){
  if (!IS_DESKTOP) return;
  const fwd = (keys['KeyW'] || keys['ArrowUp']   ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown']  ? 1 : 0);
  const str = (keys['KeyD'] || keys['ArrowRight']? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft']  ? 1 : 0);
  if (!fwd && !str) return;
  const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
  const speed  = WALK_SPEED * (sprint ? SPRINT_MULT : 1);
  const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
  // Forward at yaw=0 is -Z; strafe right at yaw=0 is +X.
  const dx = (-sin * fwd + cos * str) * speed * dt;
  const dz = (-cos * fwd - sin * str) * speed * dt;
  camera.position.x += dx;
  camera.position.z += dz;
  // Drop to ground level the moment the player starts walking
  // (so teleporting to a nest doesn't leave them floating in the air after they move).
  if (camera.position.y > EYE_HEIGHT + 0.5) {
    camera.position.y = EYE_HEIGHT;
  }
}

// ─────── Wire everything up ───────
export function setupInput(){
  // Joysticks
  setupStick('leftZone',  'leftBase',  'leftKnob',  (x, y) => { lookInput.x = x; lookInput.y = y; });
  setupStick('rightZone', 'rightBase', 'rightKnob', (x, y) => { aimInput.x  = x; aimInput.y  = y; });

  // Scope button
  document.getElementById('scopeBtn').addEventListener('click', toggleScope);

  // Fire & reload — touchstart for zero-latency on mobile, click for mouse fallback
  const fireBtn   = document.getElementById('fireBtn');
  const reloadBtn = document.getElementById('reloadBtn');
  let _lastFire = 0;
  function fireFromButton(e){
    if (e) e.preventDefault();
    const now = performance.now();
    if (now - _lastFire < 100) return; // debounce against touchstart→click double
    _lastFire = now;
    fire();
  }
  let _lastReload = 0;
  function reloadFromButton(e){
    if (e) e.preventDefault();
    const now = performance.now();
    if (now - _lastReload < 100) return;
    _lastReload = now;
    startReload();
  }
  fireBtn.addEventListener('touchstart', fireFromButton, { passive: false });
  fireBtn.addEventListener('click', fireFromButton);
  reloadBtn.addEventListener('touchstart', reloadFromButton, { passive: false });
  reloadBtn.addEventListener('click', reloadFromButton);

  // Zoom slider
  let zoomDragId = null;
  zoomSlider.addEventListener('touchstart', e => {
    if (zoomSlider.classList.contains('disabled')) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    zoomDragId = t.identifier;
    setZoomFromY(t.clientY);
  }, { passive: false });
  window.addEventListener('touchmove', e => {
    if (zoomDragId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier === zoomDragId) { e.preventDefault(); setZoomFromY(t.clientY); }
    }
  }, { passive: false });
  function onZoomEnd(e){
    if (zoomDragId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier === zoomDragId) { zoomDragId = null; }
    }
  }
  window.addEventListener('touchend', onZoomEnd, { passive: false });
  window.addEventListener('touchcancel', onZoomEnd, { passive: false });
  zoomSlider.addEventListener('mousedown', e => {
    if (zoomSlider.classList.contains('disabled')) return;
    zoomDragId = 'mouse';
    setZoomFromY(e.clientY);
  });
  window.addEventListener('mousemove', e => { if (zoomDragId === 'mouse') setZoomFromY(e.clientY); });
  window.addEventListener('mouseup', () => { if (zoomDragId === 'mouse') zoomDragId = null; });

  // ─── Desktop keyboard ───
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    keys[e.code] = true;
    if (e.code === 'KeyR')  { e.preventDefault(); startReload(); }
    if (e.code === 'Space') { e.preventDefault(); fire(); }
    if (e.code === 'KeyF')  { e.preventDefault(); toggleScope(); }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });

  // ─── Mouse-look (pointer lock for FPS feel) ───
  canvas.addEventListener('click', () => {
    if (!state.gameplayActive) return;
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
  });
  window.addEventListener('mousemove', e => {
    if (document.pointerLockElement === canvas) {
      const sens = state.isScoped ? 0.0008 : 0.0025;
      state.yaw   -= e.movementX * sens;
      state.pitch -= e.movementY * sens;
      const PMAX = Math.PI / 2 - 0.05;
      if (state.pitch > PMAX)  state.pitch = PMAX;
      if (state.pitch < -PMAX) state.pitch = -PMAX;
    }
  });

  // Left-click fires when locked
  canvas.addEventListener('mousedown', e => {
    if (document.pointerLockElement === canvas && e.button === 0) {
      e.preventDefault();
      fire();
    }
  });

  // Right-click toggles scope when locked
  canvas.addEventListener('contextmenu', e => {
    if (document.pointerLockElement === canvas) {
      e.preventDefault();
      toggleScope();
    }
  });

  // Scroll wheel zoom
  canvas.addEventListener('wheel', e => {
    if (!state.gameplayActive) return;
    e.preventDefault();
    state.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, state.zoom - Math.sign(e.deltaY) * 0.5));
    updateZoomUI();
    updateCameraFov();
  }, { passive: false });
}
