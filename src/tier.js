// ─────── Device tier detection ───────
// Picks pixelRatio, sky segments, head segments, fog distance, and HUD
// throttling based on platform & cores. No THREE / DOM dependencies.

export const DEVICE_TIER = (() => {
  const ua = navigator.userAgent;
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (!isMobile && cores >= 8) return 'high';
  if (isMobile && (cores <= 4 || mem <= 3)) return 'low';
  return 'mid';
})();

export const TIER = {
  low:  { pixelRatio: 1.0,  skySeg: [10, 6],  headSeg: 8,  shadowMap: false, fogFar: 240, throttleLabels: 6, throttleMini: 4 },
  mid:  { pixelRatio: 1.25, skySeg: [16, 8],  headSeg: 10, shadowMap: false, fogFar: 320, throttleLabels: 4, throttleMini: 3 },
  high: { pixelRatio: 1.5,  skySeg: [32, 16], headSeg: 12, shadowMap: false, fogFar: 400, throttleLabels: 2, throttleMini: 2 },
}[DEVICE_TIER];
