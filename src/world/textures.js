import * as THREE from 'three';
import { RNG } from '../core/rng.js';

// All textures are painted onto canvases at startup, so there are no image assets.

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export function groundTexture() {
  const rng = new RNG(11);
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#c8c8c8';
  g.fillRect(0, 0, 256, 256);
  // Soil speckle
  for (let i = 0; i < 5000; i++) {
    const v = Math.floor(rng.range(130, 230));
    g.fillStyle = `rgba(${v},${v},${v},${rng.range(0.15, 0.5)})`;
    g.fillRect(rng.range(0, 256), rng.range(0, 256), rng.range(1, 3), rng.range(1, 3));
  }
  // Dead leaves and needles
  for (let i = 0; i < 420; i++) {
    const x = rng.range(0, 256);
    const y = rng.range(0, 256);
    const v = Math.floor(rng.range(60, 200));
    g.save();
    g.translate(x, y);
    g.rotate(rng.range(0, Math.PI));
    g.fillStyle = `rgba(${v + 20},${v},${v - 20},${rng.range(0.3, 0.7)})`;
    if (rng.chance(0.5)) {
      g.beginPath();
      g.ellipse(0, 0, rng.range(2, 5), rng.range(1, 2.4), 0, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillRect(-rng.range(3, 7), 0, rng.range(6, 14), 0.8);
    }
    g.restore();
  }
  return finish(c);
}

export function barkTexture() {
  const rng = new RNG(23);
  const [c, g] = canvas(64, 256);
  g.fillStyle = '#b0b0b0';
  g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 90; i++) {
    const x = rng.range(0, 64);
    const v = Math.floor(rng.range(40, 170));
    g.strokeStyle = `rgba(${v},${v},${v},${rng.range(0.3, 0.8)})`;
    g.lineWidth = rng.range(1, 4);
    g.beginPath();
    g.moveTo(x, 0);
    let px = x;
    for (let y = 0; y <= 256; y += 16) {
      px += rng.range(-2, 2);
      g.lineTo(px, y);
    }
    g.stroke();
  }
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(20,20,20,${rng.range(0.3, 0.6)})`;
    g.fillRect(rng.range(0, 64), rng.range(0, 256), rng.range(3, 10), rng.range(1, 3));
  }
  return finish(c);
}

export function woodTexture() {
  const rng = new RNG(31);
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#8b8b8b';
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16) {
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, y, 128, 2);
    for (let i = 0; i < 14; i++) {
      const v = Math.floor(rng.range(70, 160));
      g.fillStyle = `rgba(${v},${v},${v},0.35)`;
      g.fillRect(rng.range(0, 128), y + rng.range(3, 14), rng.range(20, 70), 1);
    }
  }
  return finish(c);
}

export function softSprite(inner = 'rgba(255,255,255,1)', size = 128) {
  const [c, g] = canvas(size, size);
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.4, inner.replace(/[\d.]+\)$/, '0.35)'));
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return finish(c, { repeat: false });
}

export function fogTexture() {
  const rng = new RNG(5);
  const [c, g] = canvas(128, 128);
  for (let i = 0; i < 26; i++) {
    const x = rng.range(34, 94);
    const y = rng.range(44, 84);
    const r = rng.range(16, 40);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.12)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  }
  return finish(c, { repeat: false });
}

export function signTexture(lines) {
  const [c, g] = canvas(256, 128);
  g.fillStyle = '#6b5a45';
  g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`;
    g.fillRect(0, Math.random() * 128, 256, 1 + Math.random() * 2);
  }
  g.fillStyle = '#e8e0cc';
  g.textAlign = 'center';
  g.font = 'bold 26px Georgia, serif';
  lines.forEach((l, i) => g.fillText(l, 128, 44 + i * 34));
  // Scratches over the text
  g.strokeStyle = 'rgba(40,10,8,0.8)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(30, 100);
  g.lineTo(220, 30);
  g.stroke();
  return finish(c, { repeat: false });
}
