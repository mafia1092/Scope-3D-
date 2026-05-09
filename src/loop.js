// ─────── Main rAF loop ───────
// Pulls input → updates camera/breath/reload/targets/particles → renders.
// HUD pieces (compass, labels, minimap) are throttled per device tier.

import { renderer, scene, camera, composer, noirPass } from './scene.js';
import { TIER, DEVICE_TIER } from './tier.js';
import { state, cine } from './state.js';
import { lookInput, aimInput, readKeyboardInput } from './input.js';
import { updateRifle } from './entities/rifle.js';
import { updateTargets } from './entities/targets.js';
import { updateParticles } from './entities/fx.js';
import {
  updateCompass, updateTargetLabels, updateMinimap,
  setSteadyState, tickReload,
} from './ui/hud.js';

let lastT = 0;
let _frame = 0;
let running = false;

// FPS smoothing — accumulator over ~250ms so the readout doesn't flicker
const fpsEl = document.getElementById('fpsReadout');
let _fpsAcc = 0, _fpsCount = 0, _lastFpsUpdate = 0;

function tick(){
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  _frame++;

  // FPS readout (smoothed, refreshed ~4×/s)
  _fpsAcc += 1 / Math.max(0.001, dt);
  _fpsCount++;
  if (now - _lastFpsUpdate > 250) {
    const fps = Math.round(_fpsAcc / _fpsCount);
    if (fpsEl) fpsEl.textContent = fps + ' FPS · ' + DEVICE_TIER;
    _fpsAcc = 0; _fpsCount = 0; _lastFpsUpdate = now;
  }

  // Pull keyboard input into lookInput before consuming it
  readKeyboardInput();

  // Camera control via look stick (yaw + pitch) — disabled during cinematic
  if (!cine.active) {
    const lookSpeed = state.isScoped ? 0.8 / state.zoom : 2.0;
    state.yaw   -= lookInput.x * lookSpeed * dt;
    state.pitch -= lookInput.y * lookSpeed * dt;
    const PMAX = Math.PI / 2 - 0.05;
    if (state.pitch > PMAX)  state.pitch = PMAX;
    if (state.pitch < -PMAX) state.pitch = -PMAX;

    // Fine aim: slower
    const fineSpeed = state.isScoped ? 0.2 / state.zoom : 0.5;
    state.yaw   -= aimInput.x * fineSpeed * dt;
    state.pitch -= aimInput.y * fineSpeed * dt;
  }

  // Apply to camera (Euler order YXZ)
  camera.rotation.order = 'YXZ';
  camera.rotation.y = state.yaw;
  camera.rotation.x = state.pitch;
  camera.rotation.z = 0;

  // Rifle bob/sway/recoil
  updateRifle(dt, state.isScoped, state.breathHold);

  // Breath-hold
  const isStill =
    Math.abs(lookInput.x) + Math.abs(lookInput.y) < 0.1 &&
    Math.abs(aimInput.x)  + Math.abs(aimInput.y)  < 0.1;
  if (state.isScoped && isStill) {
    state.breathHold = Math.min(1, state.breathHold + dt * 0.55);
  } else {
    state.breathHold = Math.max(0, state.breathHold - dt * 0.9);
  }
  setSteadyState(state.breathHold > 0.7);

  // Reload progress
  tickReload();

  // Targets + particles
  updateTargets(dt);
  updateParticles(dt);

  // Throttle expensive UI updates by device tier
  if (_frame % 2 === 0) updateCompass();
  if (_frame % TIER.throttleLabels === 0) updateTargetLabels();
  if (_frame % TIER.throttleMini === 0) updateMinimap();

  // Drive the noir grain shader; render through the composer (post-processing).
  noirPass.uniforms.time.value = now * 0.001;
  composer.render();
  if (running) requestAnimationFrame(tick);
}

export function start(){
  if (running) return;
  running = true;
  lastT = performance.now();
  _lastFpsUpdate = lastT;
  requestAnimationFrame(tick);
}

export function stop(){
  running = false;
}
