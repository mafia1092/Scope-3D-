// ─────── Three.js scene singletons ───────
// Renderer, scene, camera, lighting, sky, sun + camera FOV helper + resize.
// Three.js r128 is loaded as an ES module via the importmap in index.html, so
// THREE is imported as a namespace here (same pattern as the JSM postprocessing
// modules below). Classic `window.THREE` is no longer used.

import * as THREE from 'three';
import { EffectComposer } from 'https://unpkg.com/three@0.128.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://unpkg.com/three@0.128.0/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'https://unpkg.com/three@0.128.0/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'https://unpkg.com/three@0.128.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GammaCorrectionShader } from 'https://unpkg.com/three@0.128.0/examples/jsm/shaders/GammaCorrectionShader.js';
import { TIER, DEVICE_TIER } from './tier.js';
import { FOV_NORMAL, state } from './state.js';

// ─── Canvas + WebGL renderer ───
export const canvas = document.getElementById('canvas');
export const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, TIER.pixelRatio));
renderer.setClearColor(0x0a0d12);
// Defensive: ensure shadow map is OFF (we don't use it; some browsers/extensions
// can flip it on, which silently kills perf).
renderer.shadowMap.enabled = false;
// Cinematic noir tone mapping + sRGB output. The post-processing pipeline lifts
// highlights, so we keep exposure slightly under 1 to retain the dusk mood.
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;

// Handle context loss gracefully
canvas.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  console.warn('WebGL context lost — will restore');
});
canvas.addEventListener('webglcontextrestored', () => {
  console.log('WebGL context restored');
});

// ─── Scene + fog ───
// Lighter cool haze; starts farther so close-range gameplay isn't murky.
// (Earlier 30→fogFar*0.85 was too aggressive — buildings vanished.)
export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x4a525a, 120, TIER.fogFar * 1.4);

// ─── Camera ───
export const camera = new THREE.PerspectiveCamera(FOV_NORMAL, 1, 0.5, 2000);
camera.position.set(0, 60, 0); // initial nest position; setNest() repositions
scene.add(camera); // camera must be in scene for its children (rifle) to render

// ─── Lighting (dusk noir) ───
// Amber low-angle sun, slightly weaker since post-processing lifts highlights.
export const sunLight = new THREE.DirectionalLight(0xfca06b, 0.7);
sunLight.position.set(-30, 35, -50);
scene.add(sunLight);

// Cooler, slightly stronger ambient so the cool shadows aren't crushed.
export const ambientLight = new THREE.AmbientLight(0x14202a, 0.85);
scene.add(ambientLight);

// Cool grey sky bounce vs near-black ground bounce.
export const hemiLight = new THREE.HemisphereLight(0x6b7a85, 0x0a0e14, 0.35);
scene.add(hemiLight);

// ─── Procedural sky gradient (large inverted sphere) ───
// Deep slate-blue zenith → smoky mid-horizon → dim warm haze near the ground.
const skyGeo = new THREE.SphereGeometry(1500, TIER.skySeg[0], TIER.skySeg[1]);
const skyMat = new THREE.ShaderMaterial({
  uniforms: {
    topColor:    { value: new THREE.Color(0x111723) },
    midColor:    { value: new THREE.Color(0x4a4a52) },
    bottomColor: { value: new THREE.Color(0x705a4a) },
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

// ─── Cinematic-noir post-processing pipeline ───
// 1) RenderPass — base scene
// 2) UnrealBloomPass — highlights only (sun, hit fx, rim light)
// 3) NoirShader — split-tone color grade + vignette + grain + chromatic aberration
const NoirShader = {
  uniforms: {
    tDiffuse:      { value: null },
    time:          { value: 0 },
    vignette:      { value: 1.15 },
    grain:         { value: 0.045 },
    aberration:    { value: 0.0014 },
    shadowTint:    { value: new THREE.Color(0x1a2a2c) },
    highlightTint: { value: new THREE.Color(0xffe1b8) },
    saturation:    { value: 0.78 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time, vignette, grain, aberration, saturation;
    uniform vec3 shadowTint, highlightTint;
    varying vec2 vUv;

    // simple cheap PRNG
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }

    void main(){
      // chromatic aberration — sample R/G/B with slight offsets toward edge
      vec2 c = vUv - 0.5;
      float d = length(c);
      vec2 ofs = c * d * aberration;
      float r = texture2D(tDiffuse, vUv + ofs).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - ofs).b;
      vec3 col = vec3(r, g, b);

      // luma-based split toning: mix shadow tint into dark, highlight tint into bright
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 tinted = mix(col * shadowTint * 1.4, col * highlightTint, smoothstep(0.0, 0.85, luma));
      col = mix(col, tinted, 0.65);

      // saturation pull
      vec3 grey = vec3(luma);
      col = mix(grey, col, saturation);

      // vignette — soft radial darken
      float v = smoothstep(0.85, 0.25, d);
      col *= mix(1.0, v, vignette * 0.55);

      // film grain — add cheap noise scaled by darkness (more visible in shadows)
      float n = (hash(vUv * 800.0 + time) - 0.5) * grain * (0.4 + (1.0 - luma));
      col += n;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export const composer = new EffectComposer(renderer);
composer.setPixelRatio(renderer.getPixelRatio());
composer.addPass(new RenderPass(scene, camera));

export const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.55, // strength
  0.55, // radius
  0.85, // threshold — only the brightest pixels bloom
);
// Bloom doubles fragment work; skip on low-tier devices
if (DEVICE_TIER !== 'low') composer.addPass(bloom);

export const noirPass = new ShaderPass(NoirShader);
composer.addPass(noirPass);

// Final pass: convert linear → sRGB for correct color output. Without this,
// EffectComposer in r128 leaves colors washed-out because its intermediate
// targets are linear and the renderer's sRGB conversion is bypassed.
composer.addPass(new ShaderPass(GammaCorrectionShader));

// ─── Sizing ───
export function resize(){
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
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
