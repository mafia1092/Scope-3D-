// ─────── Three.js scene singletons ───────
// Renderer, scene, camera, lighting, sky, sun + camera FOV helper + resize.
// Three.js r128 is loaded as a classic <script> CDN tag, so we read it from
// window. The HTML guard in main.js fails before this module is imported if
// THREE isn't present.

import { TIER } from './tier.js';
import { FOV_NORMAL, state } from './state.js';

const THREE = window.THREE;

// ─── Canvas + WebGL renderer ───
export const canvas = document.getElementById('canvas');
export const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, TIER.pixelRatio));
renderer.setClearColor(0x0a0d12);

// Handle context loss gracefully
canvas.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  console.warn('WebGL context lost — will restore');
});
canvas.addEventListener('webglcontextrestored', () => {
  console.log('WebGL context restored');
});

// ─── Scene + fog ───
export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x6a5040, 60, TIER.fogFar);

// ─── Camera ───
export const camera = new THREE.PerspectiveCamera(FOV_NORMAL, 1, 0.5, 2000);
camera.position.set(0, 60, 0); // initial nest position; setNest() repositions
scene.add(camera); // camera must be in scene for its children (rifle) to render

// ─── Lighting ───
export const sunLight = new THREE.DirectionalLight(0xffe6b0, 1.0);
sunLight.position.set(80, 120, 60);
scene.add(sunLight);

export const ambientLight = new THREE.AmbientLight(0x4a5060, 0.55);
scene.add(ambientLight);

export const hemiLight = new THREE.HemisphereLight(0xffd9a0, 0x2a2030, 0.4);
scene.add(hemiLight);

// ─── Procedural sky gradient (large inverted sphere) ───
const skyGeo = new THREE.SphereGeometry(1500, TIER.skySeg[0], TIER.skySeg[1]);
const skyMat = new THREE.ShaderMaterial({
  uniforms: {
    topColor:    { value: new THREE.Color(0x2a3a5e) },
    midColor:    { value: new THREE.Color(0xc89060) },
    bottomColor: { value: new THREE.Color(0x4a3020) },
  },
  vertexShader: `
    varying vec3 vWorldPosition;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPosition = wp.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 topColor;
    uniform vec3 midColor;
    uniform vec3 bottomColor;
    varying vec3 vWorldPosition;
    void main() {
      float h = normalize(vWorldPosition).y;
      vec3 col;
      if (h > 0.0) {
        col = mix(midColor, topColor, smoothstep(0.0, 0.7, h));
      } else {
        col = mix(midColor, bottomColor, smoothstep(0.0, -0.5, h));
      }
      gl_FragColor = vec4(col, 1.0);
    }
  `,
  side: THREE.BackSide,
  depthWrite: false,
});
export const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

// ─── Sun disk (cosmetic) ───
const sunGeo = new THREE.SphereGeometry(15, 16, 16);
const sunMat = new THREE.MeshBasicMaterial({ color: 0xffe49a, fog: false });
export const sun = new THREE.Mesh(sunGeo, sunMat);
sun.position.copy(sunLight.position).normalize().multiplyScalar(900);
scene.add(sun);

// ─── Sizing ───
export function resize(){
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);

// ─── FOV helper used by zoom slider, scope toggle, cinematic intro ───
export function updateCameraFov(){
  const fov = state.isScoped ? FOV_NORMAL / state.zoom : FOV_NORMAL;
  camera.fov = fov;
  camera.updateProjectionMatrix();
}
