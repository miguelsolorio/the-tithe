import * as THREE from 'three';
import { makeRng } from '../../../core/rng.js';

// Procedural portrait for the painting prop: a dark varnished oil of a sitter
// whose face has been defaced (smeared, scratched out, blacked over or
// dragged into a scream). Cached per variant and aspect ratio.
const TAU = Math.PI * 2;
const cache = new Map();

export function portraitMaterial(variant = 0, aspect = 0.75) {
  const v = ((Math.floor(variant) % 4) + 4) % 4;
  const a = Math.max(0.4, Math.min(2, Math.round(aspect * 10) / 10));
  const key = `${v}:${a}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const H = 256;
  const W = Math.round(H * a);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const rng = makeRng(911 + v * 37);
  const s = Math.min(W, H * 0.75);

  // Varnished ground with a glow behind the head.
  const bg = g.createRadialGradient(W * 0.5, H * 0.34, 4, W * 0.5, H * 0.42, H * 0.75);
  bg.addColorStop(0, '#5a4628');
  bg.addColorStop(0.45, '#2a1f12');
  bg.addColorStop(1, '#0a0705');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // Shoulders, coat, collar, neck.
  const hx = W * 0.5;
  const hy = H * 0.36;
  const hr = s * 0.2;
  g.fillStyle = '#0d0a08';
  g.beginPath();
  g.moveTo(hx - s * 0.55, H);
  g.quadraticCurveTo(hx - s * 0.48, hy + hr * 1.9, hx, hy + hr * 1.75);
  g.quadraticCurveTo(hx + s * 0.48, hy + hr * 1.9, hx + s * 0.55, H);
  g.closePath();
  g.fill();
  g.fillStyle = '#5e5442';
  g.beginPath();
  g.moveTo(hx - hr * 0.55, hy + hr * 1.55);
  g.lineTo(hx, hy + hr * 2.3);
  g.lineTo(hx + hr * 0.55, hy + hr * 1.55);
  g.closePath();
  g.fill();
  g.fillStyle = '#6a543c';
  g.fillRect(hx - hr * 0.35, hy + hr * 0.9, hr * 0.7, hr * 0.8);

  // Head: pale, lit from the upper left.
  const face = g.createRadialGradient(hx - hr * 0.35, hy - hr * 0.35, 2, hx, hy, hr * 1.5);
  face.addColorStop(0, '#c4a684');
  face.addColorStop(0.55, '#86684c');
  face.addColorStop(1, '#2c2016');
  g.fillStyle = face;
  g.beginPath();
  g.ellipse(hx, hy, hr, hr * 1.28, 0, 0, TAU);
  g.fill();
  g.fillStyle = '#140e0a';
  g.beginPath();
  g.ellipse(hx, hy - hr * 0.7, hr * 1.08, hr * 0.72, 0, Math.PI * 1.02, TAU * 0.99);
  g.fill();
  const eyes = (col, w, h) => {
    g.fillStyle = col;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.ellipse(hx + sx * hr * 0.4, hy - hr * 0.08, hr * w, hr * h, 0, 0, TAU);
      g.fill();
    }
  };
  eyes('#1c120c', 0.19, 0.11);
  g.strokeStyle = '#3c2618';
  g.lineWidth = Math.max(1, hr * 0.06);
  g.beginPath();
  g.moveTo(hx - hr * 0.28, hy + hr * 0.62);
  g.quadraticCurveTo(hx, hy + hr * 0.55, hx + hr * 0.28, hy + hr * 0.62);
  g.stroke();

  // Defacement.
  if (v === 0) {
    // Wet paint dragged downward in strips.
    for (let i = 0; i < 70; i++) {
      const sx = hx - hr * 1.2 + rng() * hr * 2.4;
      const sw = 2 + rng() * 7;
      const len = 8 + rng() * hr * 2.2;
      g.globalAlpha = 0.18 + rng() * 0.2;
      g.drawImage(cv, sx, hy - hr * 1.2, sw, hr * 2.4, sx + (rng() - 0.5) * 3, hy - hr * 1.2 + len * 0.35, sw, hr * 2.4 + len);
    }
    g.globalAlpha = 1;
    eyes('#060403', 0.16, 0.2);
  } else if (v === 1) {
    // Eyes scratched out.
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 26; i++) {
        const cx = hx + sx * hr * 0.4;
        const cy = hy - hr * 0.08;
        g.strokeStyle = rng() < 0.6 ? 'rgba(210,196,170,0.7)' : 'rgba(90,10,12,0.8)';
        g.lineWidth = 0.6 + rng() * 1.4;
        g.beginPath();
        g.moveTo(cx + (rng() - 0.5) * hr * 0.7, cy + (rng() - 0.5) * hr * 0.5);
        g.lineTo(cx + (rng() - 0.5) * hr * 0.7, cy + (rng() - 0.5) * hr * 0.5);
        g.stroke();
      }
    }
  } else if (v === 2) {
    // Face blacked over, a sigil painted across it in dried blood.
    g.fillStyle = '#070505';
    for (let i = 0; i < 30; i++) {
      g.globalAlpha = 0.5;
      g.beginPath();
      g.ellipse(hx + (rng() - 0.5) * hr * 0.4, hy + (rng() - 0.5) * hr * 0.4, hr * (0.8 + rng() * 0.3), hr * (1.05 + rng() * 0.3), (rng() - 0.5) * 0.4, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    g.strokeStyle = '#5c0c0e';
    g.lineWidth = hr * 0.09;
    g.beginPath();
    g.arc(hx, hy, hr * 0.85, 0, TAU);
    g.moveTo(hx, hy - hr * 0.85);
    g.lineTo(hx + hr * 0.74, hy + hr * 0.42);
    g.lineTo(hx - hr * 0.74, hy + hr * 0.42);
    g.closePath();
    g.moveTo(hx, hy - hr * 1.2);
    g.lineTo(hx, hy + hr * 1.2);
    g.stroke();
    for (let i = 0; i < 6; i++) {
      const dx = hx + (rng() - 0.5) * hr * 1.4;
      const dy = hy + hr * (0.3 + rng() * 0.5);
      g.fillStyle = '#4a0a0c';
      g.fillRect(dx, dy, hr * 0.05, hr * (0.4 + rng() * 1.2));
    }
  } else {
    // Features stretched into a scream and smeared sideways.
    g.fillStyle = '#050303';
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.ellipse(hx + sx * hr * 0.38, hy - hr * 0.02, hr * 0.14, hr * 0.32, sx * 0.15, 0, TAU);
      g.fill();
    }
    g.beginPath();
    g.ellipse(hx, hy + hr * 0.72, hr * 0.2, hr * 0.42, 0, 0, TAU);
    g.fill();
    for (let i = 0; i < 40; i++) {
      const sy = hy - hr * 1.2 + rng() * hr * 2.4;
      const sh = 2 + rng() * 5;
      g.globalAlpha = 0.2;
      g.drawImage(cv, hx - hr * 1.3, sy, hr * 2.6, sh, hx - hr * 1.3 + (rng() - 0.3) * hr * 0.8, sy, hr * 2.6, sh);
    }
    g.globalAlpha = 1;
  }

  // Grime, craquelure and a dark vignette.
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rng() < 0.7 ? 'rgba(0,0,0,0.25)' : 'rgba(200,170,120,0.08)';
    g.fillRect(rng() * W, rng() * H, 1 + rng() * 2, 1 + rng() * 2);
  }
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 0.6;
  for (let i = 0; i < 60; i++) {
    let x = rng() * W;
    let y = rng() * H;
    g.beginPath();
    g.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      x += (rng() - 0.5) * 18;
      y += (rng() - 0.5) * 18;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // Old varnish: darken and warm the whole picture.
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = '#8a7658';
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.75)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
  m.name = `portrait${v}`;
  m.userData.tile = 1;
  cache.set(key, m);
  return m;
}
