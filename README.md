# Scope · 3D

Single-rifle, scoped sniper game built with Three.js (r128). Plays on desktop with mouse + keyboard, and on mobile with touch joysticks.

## Run it

ES modules require an HTTP server — opening `index.html` directly via `file://` will fail.

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/> in a browser.

A standalone, single-file build is also kept at `scope-3D.html` — that one works over `file://` if you'd rather just double-click it.

## Controls

### Desktop
- **Click canvas** — lock pointer
- **Mouse** — look
- **Left-click** — fire
- **Right-click** — toggle scope
- **Scroll wheel** — zoom (when scoped)
- **WASD / arrows** — look (without pointer lock)
- **R** — reload
- **F** — toggle scope
- **Space** — fire

### Mobile
- **Left joystick** — look
- **Right joystick** — fine aim
- **Scope / Fire / Reload** buttons — bottom edge
- **Zoom slider** — left edge (when scoped)
- **Minimap** — tap a nest to teleport

## Project layout

```
index.html                ← main entry (loads ES modules)
scope-3D.html             ← single-file build (works via file://)
src/
├── main.js               ← bootstrap
├── state.js              ← shared state, NESTS, CONTRACTS
├── tier.js               ← device-tier detection (low/mid/high)
├── scene.js              ← renderer, camera, lights, sky
├── loop.js               ← rAF render loop
├── input.js              ← joysticks, keyboard, mouse, buttons
├── world/
│   ├── nests.js          ← 8 sniper-nest platforms
│   └── city.js           ← procedural city + ground
├── entities/
│   ├── targets.js        ← humanoids, drones, contracts, hitables
│   ├── rifle.js          ← first-person rifle + recoil
│   └── fx.js             ← particle pool, hit/dust effects
└── ui/
    └── hud.js            ← HUD, compass, labels, minimap, fire/reload, dossier, cinematic
```
