// ─────── Bootstrap ───────
// Three.js r128 is loaded as an ES module via the importmap in index.html.
// All module imports are static so module side-effects (renderer creation,
// rifle attached to camera, scene/lights/sky/post-processing created, resize
// listener wired) fire in dependency order before main()'s body executes.
// If the import fails (offline, CDN blocked) the whole module fails and the
// loading screen stays up — we surface a friendlier error via window.onerror.

window.addEventListener('error', e => {
  // Trap module load errors and replace the loading screen with a friendly note.
  const msg = String(e?.message || '');
  if (/three|module|import/i.test(msg)) {
    const el = document.getElementById('loading');
    if (el) {
      el.innerHTML =
        '<h1 style="color:#a83c2a">FAILED TO LOAD 3D ENGINE</h1>' +
        '<p style="font-size:12px;opacity:0.7;margin-top:14px;">Check your internet connection.</p>';
    }
  }
});

import './scene.js';                                  // renderer, scene, camera, lights, sky, sun, post-processing
import './entities/rifle.js';                         // rifle attached to camera (side-effect)
import { preloadKit, buildCity, buildGround } from './world/city.js';
import { buildAllNests, setNest, setOnNestChange } from './world/nests.js';
import { spawnTargets } from './entities/targets.js';
import * as hud from './ui/hud.js';
import * as input from './input.js';
import * as loop from './loop.js';
import { initLeaderboard } from './leaderboard.js';

// ─── Preload the Kenney GLB kit ───
// Top-level await is fine — main.js is an ES module via importmap. Until this
// resolves the loading screen stays visible; the progress bar updates per asset.
const fillEl = document.getElementById('loadingFill');
const statusEl = document.getElementById('loadingStatus');

await preloadKit((done, total, name) => {
  if (fillEl) fillEl.style.width = `${(done/total)*100}%`;
  if (statusEl) statusEl.textContent = `Loading ${name}... (${done}/${total})`;
});

// ─── Build the world ───
buildAllNests();
buildGround();
buildCity();
spawnTargets();

// ─── Wire UI ───
hud.buildCompass();
hud.bindMinimapInput();
hud.bindCineSkip();
initLeaderboard();
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
