export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Frame-rate independent exponential smoothing factor.
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;

// Yaw that makes a +Z-facing model look along (dx, dz).
export const yawTo = (dx, dz) => Math.atan2(dx, dz);

export const dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
