// ─────── Bootstrap ───────
// Three.js r128 is loaded via classic <script> tag and exposed as window.THREE
// before this module runs. We bail early with a friendly message if it didn't
// load (offline, blocked CDN, etc).
//
// All module imports are static so module side-effects (renderer creation,
// rifle attached to camera, scene/lights/sky created, resize listener wired)
// fire in dependency order before main()'s body executes.

import './scene.js';                                  // renderer, scene, camera, lights, sky, sun
import './entities/rifle.js';                         // rifle attached to camera (side-effect)
import { buildCity, buildGround } from './world/city.js';
import { buildAllNests, setNest, setOnNestChange } from './world/nests.js';
import { spawnTargets } from './entities/targets.js';
import * as hud from './ui/hud.js';
import * as input from './input.js';
import * as loop from './loop.js';

if (typeof window.THREE === 'undefined') {
  document.getElementById('loading').innerHTML =
    '<h1 style="color:#a83c2a">FAILED TO LOAD 3D ENGINE</h1>' +
    '<p style="font-size:12px;opacity:0.7;margin-top:14px;">Check your internet connection.</p>';
} else {
  // ─── Build the world ───
  buildAllNests();
  buildGround();
  buildCity();
  spawnTargets();

  // ─── Wire UI ───
  hud.buildCompass();
  hud.bindMinimapInput();
  hud.bindCineSkip();
  // Keep minimap in sync immediately after a nest teleport
  setOnNestChange(hud.updateMinimap);

  // Place camera at the first nest (also draws the minimap via callback)
  setNest(0);

  // Initial HUD state
  hud.updateHud();
  input.updateZoomUI();
  // Camera FOV is already at FOV_NORMAL; no scope active yet.

  // ─── Wire input handlers (keyboard, mouse, joysticks, buttons, slider) ───
  input.setupInput();

  // ─── Hide loading screen, populate dossier, show the briefing panel ───
  setTimeout(() => {
    document.getElementById('loading').style.display = 'none';
    hud.populateDossier();
    document.getElementById('brief').classList.add('show');
  }, 200);

  document.getElementById('startBtn').addEventListener('click', () => {
    document.getElementById('brief').classList.remove('show');
    hud.runCinematicIntro();
  });

  // Kick off the render loop
  loop.start();
}
