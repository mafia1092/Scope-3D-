// ─────── Game state & shared constants ───────
// Pure data: no THREE imports, no DOM.

export const FOV_NORMAL = 75;
export const ZOOM_MIN = 3.0;
export const ZOOM_MAX = 10.0;
export const MINI_SCALE = 0.32;

// Mutable game state. Importers see the same object reference.
export const state = {
  isScoped: false,
  breathHold: 0,
  ammo: 8, magSize: 8, reserveAmmo: 24,
  reloading: false, reloadStart: 0, reloadDuration: 1100,
  score: 0,
  kills: 0,
  headshots: 0,
  yaw: 0,    // horizontal radians
  pitch: 0,  // vertical radians
  zoom: 3.0, // 3..10
  gameplayActive: false,
};

// Cinematic intro flags exposed as a wrapper object so we can mutate fields
// from any module without losing the live binding.
export const cine = {
  active: false,
  skipped: false,
};

// ─────── Sniper Nests (8 fixed positions) ───────
// Each nest: position (x,y,z), default yaw (radians, where 0 = facing -Z)
export const NESTS = [
  { name:'TOWER NORTH', x: 0,    y: 60,  z: 0,    yaw: Math.PI,    type:'roof' },
  { name:'EAST RIDGE',  x: 70,   y: 50,  z: -30,  yaw: -Math.PI*0.7, type:'roof' },
  { name:'SOUTH SPIRE', x: -20,  y: 75,  z: 75,   yaw: -Math.PI*0.05, type:'roof' },
  { name:'WEST PERCH',  x: -85,  y: 55,  z: 10,   yaw: Math.PI*0.5,  type:'roof' },
  { name:'GARAGE TOP',  x: 50,   y: 18,  z: 60,   yaw: -Math.PI*0.7, type:'garage' },
  { name:'OVERPASS',    x: -55,  y: 12,  z: -55,  yaw: Math.PI*0.3,  type:'overpass' },
  { name:'SCAFFOLD',    x: 80,   y: 28,  z: 35,   yaw: Math.PI*0.85, type:'scaffold' },
  { name:'STREET CORNER', x: 25, y: 2,   z: -35,  yaw: Math.PI*0.95, type:'street' },
];

// ─────── Contract definitions ───────
export const CONTRACTS = [
  {
    alias: 'THE BANKER',
    real: 'Marko Veldt',
    bio: 'Laundering cartel funds through offshore accounts. Always smoking on his rooftop terrace.',
    bounty: 1500,
    type: 'rooftop',
    look: { skin: 0xc4a47a, cloth: 0x3a2418, helmet: 0x1a1a1a, isVip: true },
  },
  {
    alias: 'THE COURIER',
    real: 'Lin "Quiet" Hao',
    bio: 'Carrying encryption keys to the next handler. Moves on foot through the alleys.',
    bounty: 2000,
    type: 'ground',
    look: { skin: 0xa88860, cloth: 0x2a3540, helmet: 0x4a4030, isVip: true },
  },
  {
    alias: 'THE GHOST',
    real: 'Unknown',
    bio: 'A rival sniper. Patrolling the rooftops looking for you.',
    bounty: 3500,
    type: 'rooftop',
    look: { skin: 0x8b6f47, cloth: 0x1a1a1a, helmet: 0x2a2520, isVip: false, hasRifle: true },
  },
];

export const TARGET_TYPES = {
  soldier: { skin: 0x8b6f47, cloth: 0x3a4a2a, helmet: 0x1a1c14, label: 'GUARD' },
  civilian: { skin: 0xc4a47a, cloth: 0x6a5040, helmet: null, label: 'CIVILIAN' },
  militia: { skin: 0x9a7a55, cloth: 0x5a3a2a, helmet: 0x2a2520, label: 'MILITIA' },
};

// Small util that nests/city/targets.js all use for placement randomness.
export function rand(a, b){ return a + Math.random() * (b - a); }
