import * as THREE from 'three';

let maxAnisotropy = 8;
export function setMaxAnisotropy(val) {
  maxAnisotropy = Math.max(1, Math.min(16, val || 8));
}

// ---------- seeded random + value/fbm noise ----------
export function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const perm = [];
{
  const r = mulberry32(1337);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}

function hash(x, y) {
  return perm[(perm[x & 255] + y) & 255] / 255;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

export function noise2(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  const u = smooth(xf);
  const v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, oct = 5) {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += noise2(x * f, y * f) * amp;
    f *= 2;
    amp *= 0.5;
  }
  return s;
}

// Tileable periodic value noise (for seamless textures)
function tileNoise(u, v, period) {
  const x = u * period;
  const y = v * period;
  const x0 = Math.floor(x) % period;
  const y0 = Math.floor(y) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const fx = smooth(x - Math.floor(x));
  const fy = smooth(y - Math.floor(y));
  const a = hash(x0, y0);
  const b = hash(x1, y0);
  const c = hash(x0, y1);
  const d = hash(x1, y1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function tileFbm(u, v, basePeriod = 4, oct = 4) {
  let sum = 0;
  let amp = 0.5;
  let p = basePeriod;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += tileNoise(u, v, p) * amp;
    norm += amp;
    p *= 2;
    amp *= 0.5;
  }
  return sum / norm;
}

// ---------- canvas + PBR normal/roughness builders ----------
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function finishTex(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  else t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAnisotropy;
  return t;
}

function heightToNormalTex(height, w, h, strength = 2.4, repeat = true) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const ym = repeat ? (y - 1 + h) % h : Math.max(0, y - 1);
    const yp = repeat ? (y + 1) % h : Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x++) {
      const xm = repeat ? (x - 1 + w) % w : Math.max(0, x - 1);
      const xp = repeat ? (x + 1) % w : Math.min(w - 1, x + 1);

      const tl = height[ym * w + xm];
      const t = height[ym * w + x];
      const tr = height[ym * w + xp];
      const l = height[y * w + xm];
      const r = height[y * w + xp];
      const bl = height[yp * w + xm];
      const b = height[yp * w + x];
      const br = height[yp * w + xp];

      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const dz = 1.0;
      const invLen = 1 / Math.hypot(dx, dy, dz);

      const idx = (y * w + x) * 4;
      data[idx] = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((-dy * invLen * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function grayToDataTex(arr, w, h, repeat = true) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(0, Math.min(255, Math.round(arr[i] * 255)));
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function speckle(ctx, w, h, n, alpha, light = false, rnd = Math.random) {
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${rnd() * alpha})`;
    ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

const cache = new Map();
function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

// ---------- Building Facade PBR (8 Unique Architectural Styles + Glossy Glazing) ----------
export function facadePBR(style) {
  return cached('facadePBR' + style, () => {
    const S = 512;
    const [c, ctx] = makeCanvas(S, S);
    const [ec, ectx] = makeCanvas(S, S);
    const hmap = new Float32Array(S * S);
    const rmap = new Float32Array(S * S);
    const rnd = mulberry32(100 + style * 37);
    const hash2 = (a, b) => {
      const t = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
      return t - Math.floor(t);
    };

    const palettes = [
      { base: '#7b3f2e', trim: '#cbbaa3', dark: '#3c2018', kind: 'brick', glass: '#17293b', mullion: '#241d18', litProb: 0.27 },
      { base: '#b3a794', trim: '#e0d6c7', dark: '#6d6252', kind: 'deco', glass: '#182737', mullion: '#4a463f', litProb: 0.33 },
      { base: '#3b4b5c', trim: '#657a8e', dark: '#1d2731', kind: 'curtain', glass: '#1b3651', mullion: '#161e26', litProb: 0.38 },
      { base: '#957a55', trim: '#cdb995', dark: '#4a3925', kind: 'brick', glass: '#162534', mullion: '#2a241e', litProb: 0.23 },
      { base: '#45484c', trim: '#757a81', dark: '#202328', kind: 'metal', glass: '#18222d', mullion: '#111417', litProb: 0.2 },
      { base: '#48626b', trim: '#8aa8af', dark: '#21333a', kind: 'curtain', glass: '#143039', mullion: '#1f2c31', litProb: 0.34 },
      { base: '#8b4b36', trim: '#e3d5bc', dark: '#44241a', kind: 'terracotta', glass: '#1d2f42', mullion: '#35271f', litProb: 0.25 },
      { base: '#6d6a63', trim: '#9e9890', dark: '#393732', kind: 'ribbon', glass: '#19293a', mullion: '#20242a', litProb: 0.3 },
    ];
    const pal = palettes[style % palettes.length];
    const hex = parseInt(pal.base.slice(1), 16);
    const br = (hex >> 16) & 255;
    const bg = (hex >> 8) & 255;
    const bb = hex & 255;

    // ---- Base masonry/cladding pass: grain, brick variance, soot & weather ----
    const img = ctx.createImageData(S, S);
    const brickW = 64;
    const brickH = 22;
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const n = tileFbm(u, v, 9, 4);
        const micro = hash2(x * 0.73, y * 1.17);
        let shade = 0.82 + n * 0.28 + (micro - 0.5) * 0.08;
        if (pal.kind === 'brick' || pal.kind === 'terracotta') {
          const row = Math.floor(y / brickH);
          const offset = row % 2 ? brickW / 2 : 0;
          const bx = (x + offset) % brickW;
          const by = y % brickH;
          const vary = hash2(Math.floor((x + offset) / brickW) + 1.3, row * 1.7);
          shade *= 0.83 + vary * 0.32;
          if (bx < 2 || by < 2) {
            shade *= 0.5;
            hmap[y * S + x] = 0.16;
          } else {
            hmap[y * S + x] = 0.48 + vary * 0.14;
          }
        } else if (pal.kind === 'deco') {
          const flute = Math.abs(Math.sin((u * 40 + n * 0.5) * Math.PI)) * 0.05;
          shade *= 0.92 + flute;
          hmap[y * S + x] = 0.5 + flute * 3.2;
        } else if (pal.kind === 'metal') {
          const rib = Math.sin(u * Math.PI * 72) * 0.5 + 0.5;
          shade *= 0.82 + rib * 0.22;
          hmap[y * S + x] = 0.26 + rib * 0.56;
        } else {
          hmap[y * S + x] = 0.55 + n * 0.16;
        }
        const soot = Math.max(0, v - 0.7) * 0.42 + Math.max(0, 0.16 - v) * 0.3;
        shade *= 1 - soot * 0.85;
        const idx = (y * S + x) * 4;
        img.data[idx] = Math.max(12, Math.min(255, br * shade));
        img.data[idx + 1] = Math.max(12, Math.min(255, bg * shade));
        img.data[idx + 2] = Math.max(12, Math.min(255, bb * shade));
        img.data[idx + 3] = 255;
        rmap[y * S + x] = pal.kind === 'metal' ? 0.42 + (1 - n) * 0.2 : 0.86 + (1 - n) * 0.1;
      }
    }
    ctx.putImageData(img, 0, 0);
    ectx.fillStyle = '#000000';
    ectx.fillRect(0, 0, S, S);

    // Continuous stone floor bands, cornice ledges & pilasters
    for (let fy = 0; fy < 4; fy++) {
      const y0 = fy * 128;
      ctx.fillStyle = pal.trim;
      ctx.globalAlpha = 0.58;
      ctx.fillRect(0, y0, S, 7);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(18,16,14,0.38)';
      ctx.fillRect(0, y0 + 7, S, 4);
      for (let x = 0; x < S; x++) {
        for (let dy = 0; dy < 7; dy++) hmap[(y0 + dy) * S + x] = 0.94;
        for (let dy = 7; dy < 11; dy++) hmap[(y0 + dy) * S + x] -= 0.2;
      }
    }
    if (pal.kind === 'deco' || pal.kind === 'ribbon') {
      ctx.fillStyle = pal.trim;
      ctx.globalAlpha = 0.26;
      for (let x = 0; x < S; x += 128) ctx.fillRect(x + 6, 0, 8, S);
      ctx.globalAlpha = 1;
    }

    // Downpipes / conduits & fire-escape anchor plates
    const pipeXs = style % 2 === 0 ? [S * 0.19, S * 0.81] : [S * 0.065, S * 0.935];
    for (const px of pipeXs) {
      ctx.fillStyle = 'rgba(24,22,20,0.62)';
      ctx.fillRect(px, 0, 3, S);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(px, 0, 1, S);
      for (let py = 24; py < S; py += 96) {
        ctx.fillStyle = 'rgba(24,22,20,0.5)';
        ctx.fillRect(px - 5, py, 13, 3);
      }
    }

    // Rain/rust staining, cracks and weathered patches
    for (let i = 0; i < 280; i++) {
      const gx = rnd() * S;
      const gy = rnd() * S;
      const gh = 14 + rnd() * 74;
      const grd = ctx.createLinearGradient(gx, gy, gx, gy + gh);
      grd.addColorStop(0, pal.kind === 'metal' ? 'rgba(96,48,20,0.3)' : 'rgba(18,16,14,0.24)');
      grd.addColorStop(1, 'rgba(18,16,14,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(gx, gy, 1.5 + rnd() * 4, gh);
    }
    ctx.strokeStyle = 'rgba(14,12,10,0.5)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 24; i++) {
      let cx = rnd() * S;
      let cy = rnd() * S;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (let k = 0; k < 7; k++) {
        cx += (rnd() - 0.5) * 34;
        cy += (rnd() - 0.2) * 34;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }

    // Reflective glazing: 4 bays x 4 floors with stone surrounds, sills, frames & interiors
    for (let fy = 0; fy < 4; fy++) {
      for (let fx = 0; fx < 4; fx++) {
        const cellX = fx * 128;
        const cellY = fy * 128;
        const w = pal.kind === 'curtain' ? 100 : pal.kind === 'ribbon' ? 112 : pal.kind === 'deco' ? 68 : 74;
        const h = pal.kind === 'curtain' ? 84 : pal.kind === 'ribbon' ? 50 : pal.kind === 'deco' ? 88 : 78;
        const x = cellX + Math.floor((128 - w) / 2);
        const y = cellY + Math.floor((128 - h) / 2);
        const lit = rnd() < pal.litProb;
        const variant = rnd();

        // Stone surround, deep reveal, lintel and projecting sill
        ctx.fillStyle = pal.trim;
        ctx.fillRect(x - 10, y - 10, w + 20, h + 20);
        ctx.fillStyle = 'rgba(12,10,9,0.62)';
        ctx.fillRect(x - 5, y - 5, w + 10, h + 10);
        ctx.fillStyle = pal.trim;
        ctx.fillRect(x - 14, y - 15, w + 28, 6);
        ctx.fillRect(x - 16, y + h + 8, w + 32, 9);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(x - 16, y + h + 8, w + 32, 2);
        ctx.fillStyle = 'rgba(10,8,7,0.28)';
        ctx.fillRect(x - 16, y + h + 17, w + 32, 5);
        for (let py = Math.max(0, y - 15); py < Math.min(S, y - 9); py++) {
          for (let px = Math.max(0, x - 14); px < Math.min(S, x + w + 14); px++) hmap[py * S + px] = 0.93;
        }
        for (let py = Math.max(0, y + h + 8); py < Math.min(S, y + h + 17); py++) {
          for (let px = Math.max(0, x - 16); px < Math.min(S, x + w + 16); px++) {
            hmap[py * S + px] = 0.98;
            rmap[py * S + px] = 0.72;
          }
        }

        // Deep recessed glass with sky reflection
        for (let py = y; py < y + h; py++) {
          for (let px = x; px < x + w; px++) {
            hmap[py * S + px] = 0.12;
            rmap[py * S + px] = 0.05;
          }
        }
        const g = ctx.createLinearGradient(x, y, x + w * 0.85, y + h);
        if (lit) {
          const warm = ['#ffe6b4', '#ffd08b', '#e8a74f'][fx % 3];
          g.addColorStop(0, warm);
          g.addColorStop(0.55, '#c98a3e');
          g.addColorStop(1, '#7e4b17');
        } else {
          g.addColorStop(0, '#6b93b8');
          g.addColorStop(0.42, pal.glass);
          g.addColorStop(1, '#070d13');
        }
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);

        if (lit) {
          // Warm interior glow with blinds and a faint room silhouette
          ectx.fillStyle = g;
          ectx.fillRect(x, y, w, h);
          if (variant < 0.55) {
            const blinds = 6 + Math.floor(rnd() * 8);
            const bh = Math.floor(h * 0.35);
            ctx.fillStyle = 'rgba(38,24,12,0.4)';
            ectx.fillStyle = 'rgba(0,0,0,0.5)';
            for (let b = 0; b < blinds; b++) {
              const by = y + Math.floor((b / blinds) * bh);
              ctx.fillRect(x, by, w, 2);
              ectx.fillRect(x, by, w, 2);
            }
          }
          if (variant > 0.7) {
            ctx.fillStyle = 'rgba(30,18,8,0.35)';
            ectx.fillStyle = 'rgba(0,0,0,0.42)';
            const sway = Math.floor(w * 0.34);
            ctx.fillRect(x + Math.floor(w * 0.3), y + h - Math.floor(h * 0.52), sway, Math.floor(h * 0.52));
            ectx.fillRect(x + Math.floor(w * 0.3), y + h - Math.floor(h * 0.52), sway, Math.floor(h * 0.52));
          }
        } else {
          // Cool glass sheen + interior blinds/curtain silhouettes
          ctx.fillStyle = 'rgba(186,222,255,0.22)';
          ctx.beginPath();
          ctx.moveTo(x + 2, y + 2);
          ctx.lineTo(x + w * 0.7, y + 2);
          ctx.lineTo(x + 2, y + h * 0.78);
          ctx.closePath();
          ctx.fill();
          if (variant < 0.42) {
            ctx.fillStyle = 'rgba(8,14,20,0.45)';
            for (let b = 0; b < 7; b++) {
              ctx.fillRect(x, y + Math.floor((b / 7) * h * 0.5), w, 2);
            }
          } else if (variant > 0.82) {
            ctx.fillStyle = 'rgba(44,58,72,0.55)';
            ctx.fillRect(x, y, Math.floor(w * 0.16), h);
            ctx.fillRect(x + w - Math.floor(w * 0.16), y, Math.floor(w * 0.16), h);
          }
          if (variant > 0.92) {
            // A single lit window with cold TV light
            ectx.fillStyle = 'rgba(120,160,220,0.55)';
            ectx.fillRect(x + Math.floor(w * 0.2), y + Math.floor(h * 0.35), Math.floor(w * 0.6), Math.floor(h * 0.5));
          }
        }

        // Window frame, mullions and sash bars
        ctx.fillStyle = pal.mullion;
        ctx.fillRect(x - 3, y - 3, w + 6, 3);
        ctx.fillRect(x - 3, y + h, w + 6, 3);
        ctx.fillRect(x - 3, y - 3, 3, h + 6);
        ctx.fillRect(x + w, y - 3, 3, h + 6);
        ctx.fillRect(x + Math.floor(w / 2) - 1, y, 2, h);
        ctx.fillRect(x, y + Math.floor(h / 2) - 1, w, 2);
        ectx.fillStyle = '#000000';
        ectx.fillRect(x + Math.floor(w / 2) - 1, y, 2, h);
        ectx.fillRect(x, y + Math.floor(h / 2) - 1, w, 2);
        for (let py = y; py < y + h; py++) {
          for (let px = x; px < x + w; px++) {
            const onFrame = px < x + 3 || px > x + w - 4 || py < y + 3 || py > y + h - 4 || Math.abs(px - (x + w / 2)) < 2 || Math.abs(py - (y + h / 2)) < 2;
            if (onFrame) {
              hmap[py * S + px] = 0.62;
              rmap[py * S + px] = 0.34;
            }
          }
        }

        // Occasional boards, broken pane or window AC unit
        if (variant > 0.945) {
          ctx.fillStyle = 'rgba(72,52,34,0.95)';
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, w, h);
          ctx.clip();
          for (let b = 0; b < 3; b++) {
            ctx.fillRect(x - 6, y + 10 + b * Math.floor(h / 3), w + 12, 7);
          }
          ctx.restore();
          ectx.fillStyle = '#000000';
          ectx.fillRect(x, y, w, h);
        } else if (variant > 0.9) {
          ctx.strokeStyle = 'rgba(210,235,255,0.65)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + w * 0.3, y + 2);
          ctx.lineTo(x + w * 0.55, y + h * 0.55);
          ctx.lineTo(x + w * 0.4, y + h - 2);
          ctx.moveTo(x + w * 0.55, y + h * 0.55);
          ctx.lineTo(x + w * 0.85, y + h * 0.8);
          ctx.stroke();
        } else if (variant < 0.08 && pal.kind !== 'curtain') {
          ctx.fillStyle = 'rgba(120,124,128,0.9)';
          ctx.fillRect(x + Math.floor(w * 0.12), y + h + 9, Math.floor(w * 0.45), 18);
          ctx.fillStyle = 'rgba(40,44,48,0.9)';
          for (let r = 0; r < 3; r++) ctx.fillRect(x + Math.floor(w * 0.12), y + h + 12 + r * 5, Math.floor(w * 0.45), 2);
          for (let py = y + h + 9; py < y + h + 27; py++) {
            for (let px = x + Math.floor(w * 0.12); px < x + Math.floor(w * 0.12) + Math.floor(w * 0.45); px++) hmap[py * S + px] = 0.85;
          }
        }
      }
    }

    return {
      map: finishTex(c, true, true),
      emissiveMap: finishTex(ec, true, true),
      normalMap: heightToNormalTex(hmap, S, S, 2.6, true),
      roughnessMap: grayToDataTex(rmap, S, S, true),
    };
  });
}

export function facadeTexture(style) {
  return facadePBR(style).map;
}

export function facadeEmissive(style) {
  return facadePBR(style).emissiveMap;
}

// ---------- Asphalt PBR ----------
export function asphaltPBR() {
  return cached('asphaltPBR', () => {
    const S = 512;
    const [c, ctx] = makeCanvas(S, S);
    const hmap = new Float32Array(S * S);
    const rmap = new Float32Array(S * S);
    const rnd = mulberry32(404);

    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const coarse = tileFbm(u, v, 6, 4);
        const fine = tileFbm(u, v, 32, 3);
        const grit = (rnd() - 0.5) * 0.14;
        const puddle = Math.max(0, (coarse - 0.62) * 2.6);

        const lum = Math.max(18, Math.min(90, 42 + (coarse - 0.5) * 26 + (fine - 0.5) * 18 + grit * 45 - puddle * 14));
        const idx = (y * S + x) * 4;
        img.data[idx] = lum;
        img.data[idx + 1] = lum + 1;
        img.data[idx + 2] = lum + 3;
        img.data[idx + 3] = 255;

        hmap[y * S + x] = 0.5 + fine * 0.3 + grit * 0.25 - puddle * 0.25;
        rmap[y * S + x] = Math.max(0.22, Math.min(0.98, 0.88 - puddle * 0.55 + grit * 0.12));
      }
    }
    ctx.putImageData(img, 0, 0);

    // Tar-filled cracks
    ctx.strokeStyle = 'rgba(12,12,14,0.75)';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 16; i++) {
      ctx.beginPath();
      let x = rnd() * S;
      let y = rnd() * S;
      ctx.moveTo(x, y);
      for (let k = 0; k < 10; k++) {
        x += (rnd() - 0.5) * 42;
        y += (rnd() - 0.5) * 42;
        ctx.lineTo(x, y);
        const ix = ((Math.floor(x) % S) + S) % S;
        const iy = ((Math.floor(y) % S) + S) % S;
        hmap[iy * S + ix] -= 0.22;
      }
      ctx.stroke();
    }

    return {
      map: finishTex(c, true, true),
      normalMap: heightToNormalTex(hmap, S, S, 2.2, true),
      roughnessMap: grayToDataTex(rmap, S, S, true),
    };
  });
}

export function asphaltTexture() {
  return asphaltPBR().map;
}

// ---------- Concrete PBR ----------
export function concretePBR() {
  return cached('concretePBR', () => {
    const S = 256;
    const [c, ctx] = makeCanvas(S, S);
    const hmap = new Float32Array(S * S);
    const rmap = new Float32Array(S * S);
    const rnd = mulberry32(909);

    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const n = tileFbm(u, v, 6, 4);
        const micro = tileFbm(u, v, 24, 3);
        const pit = rnd() < 0.015 ? -0.25 : 0;
        const seam = x < 2 || y < 2 || Math.abs(x - 128) < 2 || Math.abs(y - 128) < 2 ? 1 : 0;
        const base = 135 + (n - 0.5) * 34 + (micro - 0.5) * 18 + pit * 60 - seam * 45;
        const idx = (y * S + x) * 4;
        img.data[idx] = Math.max(30, Math.min(220, base));
        img.data[idx + 1] = Math.max(30, Math.min(220, base - 2));
        img.data[idx + 2] = Math.max(30, Math.min(220, base - 6));
        img.data[idx + 3] = 255;

        hmap[y * S + x] = 0.6 + micro * 0.2 + pit - seam * 0.35;
        rmap[y * S + x] = Math.max(0.65, Math.min(0.98, 0.85 + (1 - n) * 0.12));
      }
    }
    ctx.putImageData(img, 0, 0);

    return {
      map: finishTex(c, true, true),
      normalMap: heightToNormalTex(hmap, S, S, 2.0, true),
      roughnessMap: grayToDataTex(rmap, S, S, true),
    };
  });
}

export function concreteTexture() {
  return concretePBR().map;
}

// ---------- Ground PBR (burnt / snow / grass) ----------
export function groundPBR(kind) {
  return cached('groundPBR' + kind, () => {
    const S = 512;
    const [c, ctx] = makeCanvas(S, S);
    const hmap = new Float32Array(S * S);
    const rmap = new Float32Array(S * S);
    const rnd = mulberry32(kind === 'snow' ? 314 : kind === 'burnt' ? 271 : 161);

    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const macro = tileFbm(u, v, 4, 4);
        const detail = tileFbm(u, v, 16, 4);
        const micro = tileFbm(u, v, 48, 2);
        const grit = (rnd() - 0.5) * 0.1;

        let r, g, b, h, rough;
        if (kind === 'snow') {
          // Wind-sculpted sastrugi snow ripples with cool shadow troughs & subtle grit
          const drift = tileFbm(u * 0.8 + v * 0.25, v * 1.4, 6, 3);
          const ridge = Math.pow(drift, 1.35);
          const speck = grit * 14;
          r = 192 + ridge * 46 + (micro - 0.5) * 18 + speck;
          g = 204 + ridge * 40 + (micro - 0.5) * 16 + speck;
          b = 218 + ridge * 30 + (micro - 0.5) * 14 + speck;
          h = drift * 0.78 + micro * 0.25;
          rough = 0.65 + (1 - ridge) * 0.24 + grit * 0.14;
        } else if (kind === 'burnt') {
          // Charred soil, ash drifts, scorched mud & pebbles
          const ash = Math.max(0, macro - 0.52) * 1.8;
          const pebble = rnd() < 0.008 ? 0.3 : 0;
          r = 68 + detail * 46 - ash * 26 + grit * 35 + pebble * 50;
          g = 58 + detail * 38 - ash * 20 + grit * 30 + pebble * 42;
          b = 46 + detail * 28 - ash * 12 + grit * 25 + pebble * 36;
          h = macro * 0.35 + detail * 0.4 + micro * 0.25 + pebble;
          rough = 0.88 + (1 - detail) * 0.1 - ash * 0.08;
        } else {
          // Dry olive/meadow grass & earth
          const moss = detail;
          r = 62 + moss * 46 + grit * 28;
          g = 78 + moss * 50 + grit * 28;
          b = 42 + moss * 26 + grit * 20;
          h = macro * 0.3 + detail * 0.4 + micro * 0.3;
          rough = 0.9 + grit * 0.08;
        }

        const idx = (y * S + x) * 4;
        img.data[idx] = Math.max(0, Math.min(255, r));
        img.data[idx + 1] = Math.max(0, Math.min(255, g));
        img.data[idx + 2] = Math.max(0, Math.min(255, b));
        img.data[idx + 3] = 255;

        hmap[y * S + x] = h;
        rmap[y * S + x] = Math.max(0.2, Math.min(1, rough));
      }
    }
    ctx.putImageData(img, 0, 0);

    // Cracked dry mud lines on burnt earth
    if (kind === 'burnt') {
      ctx.strokeStyle = 'rgba(18,14,10,0.45)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 24; i++) {
        let cx = rnd() * S;
        let cy = rnd() * S;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        for (let k = 0; k < 7; k++) {
          cx += (rnd() - 0.5) * 34;
          cy += (rnd() - 0.5) * 34;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
    }

    return {
      map: finishTex(c, true, true),
      normalMap: heightToNormalTex(hmap, S, S, kind === 'snow' ? 2.4 : 2.8, true),
      roughnessMap: grayToDataTex(rmap, S, S, true),
    };
  });
}

export function groundTexture(kind) {
  return groundPBR(kind).map;
}

// ---------- Furrowed Bark PBR ----------
export function barkPBR(style = 'burnt') {
  return cached('barkPBR' + style, () => {
    const W = 128;
    const H = 256;
    const [c, ctx] = makeCanvas(W, H);
    const hmap = new Float32Array(W * H);
    const img = ctx.createImageData(W, H);

    for (let y = 0; y < H; y++) {
      const v = y / H;
      for (let x = 0; x < W; x++) {
        const u = x / W;
        // Vertically stretched bark ridges + ridged noise
        const ridge = Math.abs(tileFbm(u * 3.0, v * 0.5, 6, 4) - 0.5) * 2;
        const fine = tileFbm(u * 2.0, v, 12, 3);
        const furrow = 1 - Math.pow(ridge, 0.7);
        const height = furrow * 0.7 + fine * 0.3;

        let r, g, b;
        if (style === 'snow') {
          const snowDust = Math.max(0, tileFbm(u, v, 4, 3) - 0.55) * 1.4;
          r = 54 + height * 46 + snowDust * 120;
          g = 43 + height * 36 + snowDust * 130;
          b = 35 + height * 28 + snowDust * 145;
        } else if (style === 'park' || style === 'pine') {
          r = 56 + height * 46;
          g = 44 + height * 36;
          b = 34 + height * 26;
        } else {
          // Charred dark bark with warm crevice contrast
          r = 32 + height * 44;
          g = 26 + height * 34;
          b = 22 + height * 26;
        }

        const idx = (y * W + x) * 4;
        img.data[idx] = Math.min(255, r);
        img.data[idx + 1] = Math.min(255, g);
        img.data[idx + 2] = Math.min(255, b);
        img.data[idx + 3] = 255;
        hmap[y * W + x] = height;
      }
    }
    ctx.putImageData(img, 0, 0);

    return {
      map: finishTex(c, true, true),
      normalMap: heightToNormalTex(hmap, W, H, 3.2, true),
    };
  });
}

export function barkTexture() {
  return barkPBR('burnt').map;
}

// ---------- Pine Bough / Needle Alpha Texture ----------
export function needleBoughTexture(style = 'burnt') {
  return cached('needleBough' + style, () => {
    const S = 256;
    const [c, ctx] = makeCanvas(S, S);
    const rnd = mulberry32(style === 'snow' ? 505 : style === 'park' ? 707 : 606);
    ctx.clearRect(0, 0, S, S);

    // Draw central woody twig spine + radiating side shoots + hundreds of needles
    const drawTwig = (x0, y0, x1, y1, width, depth) => {
      ctx.strokeStyle = style === 'snow' ? '#423226' : style === 'park' ? '#4c3a28' : '#2a221c';
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();

      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const needleCount = Math.floor(len * (style === 'burnt' ? 1.1 : 1.75));

      for (let i = 0; i < needleCount; i++) {
        const t = 0.06 + (i / Math.max(1, needleCount)) * 0.94;
        const bx = x0 + dx * t;
        const by = y0 + dy * t;
        for (const side of [-1, 1]) {
          const na = ang + side * (0.4 + rnd() * 0.6);
          const nlen = (11 + rnd() * 16) * (1 - t * 0.3);
          if (style === 'snow') {
            if (rnd() < 0.34) {
              const w = Math.floor(205 + rnd() * 42);
              ctx.strokeStyle = `rgb(${w - 10},${w - 3},${w + 6})`;
            } else {
              const gShade = Math.floor(42 + rnd() * 48);
              ctx.strokeStyle = `rgb(${Math.floor(gShade * 0.45)},${gShade + 22},${Math.floor(gShade * 0.65)})`;
            }
          } else if (style === 'park') {
            const gShade = Math.floor(58 + rnd() * 52);
            ctx.strokeStyle = `rgb(${Math.floor(gShade * 0.72)},${gShade + 20},${Math.floor(gShade * 0.44)})`;
          } else if (style === 'pine') {
            const gShade = Math.floor(42 + rnd() * 44);
            ctx.strokeStyle = `rgb(${Math.floor(gShade * 0.68)},${gShade + 18},${Math.floor(gShade * 0.46)})`;
          } else {
            // Scorched olive-charcoal & rust-brown needles
            const tone = rnd();
            ctx.strokeStyle =
              tone < 0.45
                ? `rgb(${48 + Math.floor(rnd() * 25)},${48 + Math.floor(rnd() * 22)},${32 + Math.floor(rnd() * 15)})`
                : `rgb(${68 + Math.floor(rnd() * 30)},${52 + Math.floor(rnd() * 20)},${32 + Math.floor(rnd() * 15)})`;
          }
          ctx.lineWidth = 1.5 + rnd() * 1.2;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + Math.cos(na) * nlen, by + Math.sin(na) * nlen);
          ctx.stroke();
        }
      }

      if (depth > 0) {
        const branches = 5;
        for (let b = 0; b < branches; b++) {
          const t = 0.16 + (b / branches) * 0.68;
          const bx = x0 + dx * t;
          const by = y0 + dy * t;
          for (const side of [-1, 1]) {
            const ba = ang + side * (0.52 + rnd() * 0.28);
            const bl = len * (0.48 - t * 0.18);
            drawTwig(bx, by, bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl, width * 0.65, depth - 1);
          }
        }
      }
    };

    // Anchor at bottom-center (u=0.5, v=1) fanning upward/outward
    drawTwig(S * 0.5, S * 0.96, S * 0.5, S * 0.08, 5.5, 1);

    // Organic snow patches clinging onto needle clusters
    if (style === 'snow') {
      for (let i = 0; i < 65; i++) {
        const sy = S * 0.12 + rnd() * S * 0.74;
        const spread = (sy / S) * S * 0.38;
        const sx = S * 0.5 + (rnd() - 0.5) * 2 * spread;
        const sr = 3.5 + rnd() * 8.5;
        const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
        gr.addColorStop(0, 'rgba(236,244,252,0.88)');
        gr.addColorStop(0.55, 'rgba(210,224,238,0.55)');
        gr.addColorStop(1, 'rgba(210,224,238,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    return finishTex(c, false, true);
  });
}

// ---------- Sign & Hazard Textures ----------
export function signTexture(text, bg, fg) {
  return cached('sign' + text + bg + fg, () => {
    const [c, ctx] = makeCanvas(512, 128);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 128);
    speckle(ctx, 512, 128, 1200, 0.12);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 500, 116);
    ctx.fillStyle = fg;
    let size = 56;
    ctx.font = `bold ${size}px Impact, Arial Black, sans-serif`;
    while (size > 22 && ctx.measureText(text).width > 468) {
      size -= 2;
      ctx.font = `bold ${size}px Impact, Arial Black, sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 66);
    return finishTex(c, false, true);
  });
}

export function streetSignTexture(title, subtitle = '', bg = '#16422c', fg = '#f8fafc') {
  return cached('stSign' + title + '|' + subtitle + bg + fg, () => {
    const [c, ctx] = makeCanvas(512, 192);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 192);
    speckle(ctx, 512, 192, 1600, 0.16);
    // Subtle weathering & rust streaks near corners
    ctx.fillStyle = 'rgba(40,26,14,0.22)';
    ctx.fillRect(0, 0, 512, 12);
    ctx.fillRect(0, 178, 512, 14);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 7;
    ctx.strokeRect(8, 8, 496, 176);

    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (subtitle) {
      let s1 = 52;
      ctx.font = `bold ${s1}px Impact, Arial Black, sans-serif`;
      while (s1 > 24 && ctx.measureText(title).width > 464) {
        s1 -= 2;
        ctx.font = `bold ${s1}px Impact, Arial Black, sans-serif`;
      }
      ctx.fillText(title, 256, 72);

      let s2 = 30;
      ctx.font = `bold ${s2}px monospace`;
      while (s2 > 16 && ctx.measureText(subtitle).width > 460) {
        s2 -= 1;
        ctx.font = `bold ${s2}px monospace`;
      }
      ctx.globalAlpha = 0.88;
      ctx.fillText(subtitle, 256, 138);
      ctx.globalAlpha = 1;
    } else {
      let s1 = 60;
      ctx.font = `bold ${s1}px Impact, Arial Black, sans-serif`;
      while (s1 > 24 && ctx.measureText(title).width > 464) {
        s1 -= 2;
        ctx.font = `bold ${s1}px Impact, Arial Black, sans-serif`;
      }
      ctx.fillText(title, 256, 98);
    }
    return finishTex(c, false, true);
  });
}

export function hazardTexture() {
  return cached('hazard', () => {
    const [c, ctx] = makeCanvas(128, 128);
    ctx.fillStyle = '#e8b80c';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#111111';
    for (let i = -128; i < 256; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 16, 0);
      ctx.lineTo(i + 16 + 128, 128);
      ctx.lineTo(i + 128, 128);
      ctx.fill();
    }
    speckle(ctx, 128, 128, 1500, 0.25);
    return finishTex(c, true, true);
  });
}

// ---------- Turbulent Volumetric Smoke / Cloud / Fireball Sprites ----------
export function smokeTexture() {
  return cached('smokeTurbulent', () => {
    const S = 128;
    const [c, ctx] = makeCanvas(S, S);
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = (x / S - 0.5) * 2;
        const dy = (y / S - 0.5) * 2;
        const r = Math.hypot(dx, dy);
        if (r >= 1) continue;
        const n = fbm(x * 0.055 + 11.3, y * 0.055 + 7.1, 4);
        const n2 = fbm(x * 0.12 + 3.7, y * 0.12 + 19.4, 3);
        const radial = Math.pow(Math.max(0, 1 - r), 1.45);
        const alpha = Math.max(0, Math.min(1, radial * (0.45 + n * 0.95) - (1 - radial) * 0.15));
        const shade = Math.round(185 + n * 55 + n2 * 25);
        const idx = (y * S + x) * 4;
        img.data[idx] = Math.min(255, shade);
        img.data[idx + 1] = Math.min(255, shade);
        img.data[idx + 2] = Math.min(255, shade);
        img.data[idx + 3] = Math.round(alpha * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    return finishTex(c, false, true);
  });
}

export function shockRingTexture() {
  return cached('shockRing', () => {
    const S = 256;
    const [c, ctx] = makeCanvas(S, S);
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = (x / S - 0.5) * 2;
        const dy = (y / S - 0.5) * 2;
        const r = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        const turb = fbm(Math.cos(ang) * 3 + r * 6, Math.sin(ang) * 3 + r * 6, 3);
        const ring = Math.exp(-Math.pow((r - 0.78 + (turb - 0.5) * 0.08) / 0.12, 2));
        const idx = (y * S + x) * 4;
        img.data[idx] = 240;
        img.data[idx + 1] = 225;
        img.data[idx + 2] = 210;
        img.data[idx + 3] = Math.round(Math.min(1, ring * (0.65 + turb * 0.5)) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    return finishTex(c, false, true);
  });
}

export function flakeTexture() {
  return cached('flake', () => {
    const [c, ctx] = makeCanvas(32, 32);
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.65)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    return finishTex(c, false, true);
  });
}

export function contactShadowTexture() {
  return cached('contactShadow', () => {
    const [c, ctx] = makeCanvas(64, 64);
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.65)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return finishTex(c, false, true);
  });
}

// ---------- Home Siding & Shingle PBR ----------
export function sidingPBR(style = 0) {
  return cached('sidingPBR' + style, () => {
    const S = 256;
    const [c, ctx] = makeCanvas(S, S);
    const hmap = new Float32Array(S * S);
    const rmap = new Float32Array(S * S);
    const rnd = mulberry32(810 + style * 29);
    const palettes = [
      [212, 200, 178], // warm clapboard cream
      [136, 154, 134], // sage siding
      [118, 138, 156], // slate blue clapboard
      [158, 92, 72],   // red cedar / painted brick
      [195, 156, 102], // ochre wood siding
      [182, 174, 166], // light stone plaster
    ];
    const [br, bg, bb] = palettes[style % palettes.length];
    const img = ctx.createImageData(S, S);
    const plankH = 16;

    for (let y = 0; y < S; y++) {
      const py = y % plankH;
      const lap = py / plankH;
      const groove = py < 2 ? 0.62 : 0.85 + lap * 0.22;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const v = y / S;
        const grain = tileFbm(u * 1.5, v * 5.0, 8, 3);
        const dirt = tileFbm(u, v, 4, 3);
        const shade = groove * (0.86 + grain * 0.22 - Math.max(0, 0.5 - dirt) * 0.12);
        const idx = (y * S + x) * 4;
        img.data[idx] = Math.max(0, Math.min(255, br * shade));
        img.data[idx + 1] = Math.max(0, Math.min(255, bg * shade));
        img.data[idx + 2] = Math.max(0, Math.min(255, bb * shade));
        img.data[idx + 3] = 255;

        hmap[y * S + x] = (py < 2 ? 0.15 : 0.45 + lap * 0.45) + (grain - 0.5) * 0.1;
        rmap[y * S + x] = Math.max(0.55, Math.min(0.95, 0.78 + (1 - grain) * 0.15 + (rnd() - 0.5) * 0.04));
      }
    }
    ctx.putImageData(img, 0, 0);

    return {
      map: finishTex(c, true, true),
      normalMap: heightToNormalTex(hmap, S, S, 2.4, true),
      roughnessMap: grayToDataTex(rmap, S, S, true),
    };
  });
}

export function shinglePBR(snow = false) {
  return cached('shinglePBR_' + (snow ? 'snow' : 'dry'), () => {
    const S = 256;
    const [c, ctx] = makeCanvas(S, S);
    const hmap = new Float32Array(S * S);
    const rmap = new Float32Array(S * S);
    const rnd = mulberry32(991);
    const img = ctx.createImageData(S, S);
    const rowH = 16;
    const colW = 32;

    for (let y = 0; y < S; y++) {
      const row = Math.floor(y / rowH);
      const ry = y % rowH;
      const off = (row % 2) * (colW / 2);
      for (let x = 0; x < S; x++) {
        const sx = (x + off) % colW;
        const tileId = ((Math.floor((x + off) / colW) * 37 + row * 71) & 15) / 15;
        const u = x / S;
        const v = y / S;
        const grit = tileFbm(u * 4, v * 4, 12, 3);
        const seam = ry < 2 || sx < 2;
        const base = seam ? 0.55 : 0.8 + tileId * 0.28 + (ry / rowH) * 0.16;
        let r = (54 + grit * 26) * base;
        let g = (48 + grit * 22) * base;
        let b = (44 + grit * 20) * base;

        if (snow) {
          const sn = Math.max(0, tileFbm(u, v, 5, 3) - 0.32) * 1.6;
          const k = Math.min(0.92, sn);
          r = r * (1 - k) + 225 * k;
          g = g * (1 - k) + 234 * k;
          b = b * (1 - k) + 244 * k;
        }
        const idx = (y * S + x) * 4;
        img.data[idx] = Math.min(255, r);
        img.data[idx + 1] = Math.min(255, g);
        img.data[idx + 2] = Math.min(255, b);
        img.data[idx + 3] = 255;

        hmap[y * S + x] = seam ? 0.2 : 0.45 + (ry / rowH) * 0.45 + (rnd() - 0.5) * 0.08;
        rmap[y * S + x] = seam ? 0.96 : 0.82 + (1 - grit) * 0.14;
      }
    }
    ctx.putImageData(img, 0, 0);

    return {
      map: finishTex(c, true, true),
      normalMap: heightToNormalTex(hmap, S, S, 2.5, true),
      roughnessMap: grayToDataTex(rmap, S, S, true),
    };
  });
}

// ---------- Interior Wall, Hardwood & Tile Floor PBR ----------
export function interiorWallPBR(style = 'home') {
  return cached('intWallPBR_' + style, () => {
    const S = 256;
    const [c, ctx] = makeCanvas(S, S);
    const hmap = new Float32Array(S * S);
    const rmap = new Float32Array(S * S);
    const img = ctx.createImageData(S, S);

    for (let y = 0; y < S; y++) {
      const v = y / S;
      const lower = v > 0.66;
      const rail = Math.abs(v - 0.66) < 0.025;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const n = tileFbm(u, v, 8, 3);
        const stripe = style === 'home' && !lower ? Math.sin(u * Math.PI * 24) * 0.035 : 0;
        let r, g, b, h = 0.6 + n * 0.12, rough = 0.85;

        if (style === 'hospital') {
          const tileEdge = (x % 32 < 2 || y % 32 < 2) && lower;
          const trimBand = Math.abs(v - 0.64) < 0.025;
          r = trimBand ? 60 : tileEdge ? 168 : lower ? 198 + n * 16 : 228 + n * 14;
          g = trimBand ? 132 : tileEdge ? 182 : lower ? 218 + n * 16 : 234 + n * 12;
          b = trimBand ? 142 : tileEdge ? 188 : lower ? 222 + n * 14 : 238 + n * 12;
          h = tileEdge ? 0.25 : 0.62 + n * 0.08;
          rough = lower ? 0.42 : 0.72;
        } else if (style === 'store') {
          const band = Math.abs(v - 0.88) < 0.03;
          r = band ? 115 : 206 + n * 22;
          g = band ? 105 : 196 + n * 20;
          b = band ? 92 : 178 + n * 18;
          rough = 0.84;
        } else {
          // Cozy home wallpaper upper + wood wainscoting lower
          const panel = lower && x % 32 < 3;
          r = rail ? 158 : panel ? 128 : lower ? 162 + n * 20 : 216 + (n - 0.5) * 20 + stripe * 220;
          g = rail ? 142 : panel ? 114 : lower ? 146 + n * 18 : 205 + (n - 0.5) * 18 + stripe * 200;
          b = rail ? 124 : panel ? 96 : lower ? 124 + n * 14 : 184 + (n - 0.5) * 16 + stripe * 180;
          h = rail ? 0.9 : panel ? 0.3 : 0.58 + n * 0.14;
          rough = lower ? 0.68 : 0.88;
        }

        const idx = (y * S + x) * 4;
        img.data[idx] = Math.max(0, Math.min(255, r));
        img.data[idx + 1] = Math.max(0, Math.min(255, g));
        img.data[idx + 2] = Math.max(0, Math.min(255, b));
        img.data[idx + 3] = 255;
        hmap[y * S + x] = h;
        rmap[y * S + x] = rough;
      }
    }
    ctx.putImageData(img, 0, 0);

    return {
      map: finishTex(c, true, true),
      normalMap: heightToNormalTex(hmap, S, S, 1.8, true),
      roughnessMap: grayToDataTex(rmap, S, S, true),
    };
  });
}

export function woodFloorPBR() {
  return cached('woodFloorPBR', () => {
    const S = 256;
    const [c, ctx] = makeCanvas(S, S);
    const hmap = new Float32Array(S * S);
    const rmap = new Float32Array(S * S);
    const img = ctx.createImageData(S, S);
    const plankW = 32;

    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const px = x % plankW;
        const col = Math.floor(x / plankW);
        const off = (col % 2) * 64;
        const py = (y + off) % 128;
        const seam = px < 2 || py < 2;
        const plankVar = ((col * 47 + Math.floor((y + off) / 128) * 89) & 15) / 15;
        const grain = tileFbm((x / S) * 6, (y / S) * 0.7, 10, 4);
        const shade = seam ? 0.42 : 0.78 + plankVar * 0.22 + (grain - 0.5) * 0.26;
        const idx = (y * S + x) * 4;
        img.data[idx] = Math.max(0, Math.min(255, 134 * shade));
        img.data[idx + 1] = Math.max(0, Math.min(255, 92 * shade));
        img.data[idx + 2] = Math.max(0, Math.min(255, 58 * shade));
        img.data[idx + 3] = 255;

        hmap[y * S + x] = seam ? 0.15 : 0.65 + (grain - 0.5) * 0.18;
        rmap[y * S + x] = seam ? 0.95 : 0.48 + (1 - grain) * 0.25;
      }
    }
    ctx.putImageData(img, 0, 0);

    return {
      map: finishTex(c, true, true),
      normalMap: heightToNormalTex(hmap, S, S, 2.0, true),
      roughnessMap: grayToDataTex(rmap, S, S, true),
    };
  });
}

export function tileFloorPBR(style = 'store') {
  return cached('tileFloorPBR_' + style, () => {
    const S = 256;
    const [c, ctx] = makeCanvas(S, S);
    const hmap = new Float32Array(S * S);
    const rmap = new Float32Array(S * S);
    const img = ctx.createImageData(S, S);
    const tile = style === 'bunker' ? 64 : 32;

    for (let y = 0; y < S; y++) {
      const ty = Math.floor(y / tile);
      for (let x = 0; x < S; x++) {
        const tx = Math.floor(x / tile);
        const seam = x % tile < 2 || y % tile < 2;
        const check = (tx + ty) % 2 === 0;
        const n = tileFbm(x / S, y / S, 8, 3);
        let r, g, b, rough = 0.48;

        if (style === 'hospital') {
          r = seam ? 140 : check ? 206 + n * 16 : 192 + n * 16;
          g = seam ? 152 : check ? 220 + n * 14 : 210 + n * 14;
          b = seam ? 158 : check ? 222 + n * 14 : 216 + n * 14;
          rough = seam ? 0.9 : 0.34;
        } else if (style === 'bunker') {
          const tread = !seam && ((x + y) % 8 < 2);
          r = seam ? 52 : tread ? 106 + n * 16 : 92 + n * 16;
          g = seam ? 54 : tread ? 108 + n * 16 : 95 + n * 16;
          b = seam ? 52 : tread ? 102 + n * 16 : 90 + n * 16;
          rough = seam ? 0.95 : tread ? 0.52 : 0.72;
        } else {
          r = seam ? 72 : check ? 158 + n * 24 : 118 + n * 22;
          g = seam ? 68 : check ? 148 + n * 22 : 112 + n * 20;
          b = seam ? 62 : check ? 132 + n * 20 : 102 + n * 18;
          rough = seam ? 0.92 : 0.56;
        }

        const idx = (y * S + x) * 4;
        img.data[idx] = Math.max(0, Math.min(255, r));
        img.data[idx + 1] = Math.max(0, Math.min(255, g));
        img.data[idx + 2] = Math.max(0, Math.min(255, b));
        img.data[idx + 3] = 255;

        hmap[y * S + x] = seam ? 0.15 : 0.65 + n * 0.15;
        rmap[y * S + x] = rough;
      }
    }
    ctx.putImageData(img, 0, 0);

    return {
      map: finishTex(c, true, true),
      normalMap: heightToNormalTex(hmap, S, S, 2.0, true),
      roughnessMap: grayToDataTex(rmap, S, S, true),
    };
  });
}

export function helipadTexture() {
  return cached('helipad', () => {
    const S = 512;
    const [c, ctx] = makeCanvas(S, S);
    ctx.fillStyle = '#53585e';
    ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, S, 4000, 0.16);
    ctx.strokeStyle = '#f2c200';
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.arc(256, 256, 204, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 10;
    ctx.setLineDash([28, 18]);
    ctx.beginPath();
    ctx.arc(256, 256, 172, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(176, 146, 36, 220);
    ctx.fillRect(300, 146, 36, 220);
    ctx.fillRect(176, 238, 160, 36);
    return finishTex(c, false, true);
  });
}

// ---------- Weapons, Grips, Muzzle Flash & Ammo PBR Textures ----------
export function weaponMetalPBR(variant = 'dark') {
  return cached('weaponMetalPBR_' + variant, () => {
    const S = 256;
    const [c, ctx] = makeCanvas(S, S);
    const hmap = new Float32Array(S * S);
    const rmap = new Float32Array(S * S);
    const img = ctx.createImageData(S, S);
    const base =
      variant === 'gunmetal'
        ? [82, 88, 96]
        : variant === 'olive'
          ? [68, 76, 56]
          : variant === 'brass'
            ? [188, 146, 72]
            : [44, 48, 54];

    for (let y = 0; y < S; y++) {
      const v = y / S;
      const edgeWear = v < 0.06 || v > 0.94 ? 1.18 : 1.0;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const brush = tileFbm(u * 14, v * 1.4, 8, 3);
        // Machined slide serration grooves on left quarter
        const serr = u > 0.08 && u < 0.34 && v > 0.16 && v < 0.84 && x % 10 < 4 ? 0.68 : 1.0;
        const pit = tileFbm(u * 3, v * 3, 6, 2);
        const shade = edgeWear * serr * (0.85 + brush * 0.25 + (pit - 0.5) * 0.12);
        const idx = (y * S + x) * 4;
        img.data[idx] = Math.min(255, base[0] * shade);
        img.data[idx + 1] = Math.min(255, base[1] * shade);
        img.data[idx + 2] = Math.min(255, base[2] * shade);
        img.data[idx + 3] = 255;

        hmap[y * S + x] = (serr < 1 ? 0.2 : 0.65) + (brush - 0.5) * 0.14;
        rmap[y * S + x] = variant === 'brass' ? 0.22 + (1 - brush) * 0.15 : 0.28 + (1 - brush) * 0.22 + (serr < 1 ? 0.18 : 0);
      }
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: finishTex(c, true, true),
      normalMap: heightToNormalTex(hmap, S, S, 2.2, true),
      roughnessMap: grayToDataTex(rmap, S, S, true),
    };
  });
}

export function polymerGripPBR() {
  return cached('polymerGripPBR', () => {
    const S = 128;
    const [c, ctx] = makeCanvas(S, S);
    const hmap = new Float32Array(S * S);
    const rmap = new Float32Array(S * S);
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const d1 = (x + y) % 8 < 4;
        const d2 = (x - y + 128) % 8 < 4;
        const knurl = d1 && d2 ? 1.15 : !d1 && !d2 ? 0.72 : 0.92;
        const n = tileFbm(x / S, y / S, 6, 2);
        const val = 34 * knurl + n * 10;
        const idx = (y * S + x) * 4;
        img.data[idx] = val;
        img.data[idx + 1] = val + 2;
        img.data[idx + 2] = val + 4;
        img.data[idx + 3] = 255;
        hmap[y * S + x] = knurl > 1 ? 0.9 : knurl < 0.8 ? 0.15 : 0.52;
        rmap[y * S + x] = 0.78 + (knurl < 0.8 ? 0.14 : 0);
      }
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: finishTex(c, true, true),
      normalMap: heightToNormalTex(hmap, S, S, 2.6, true),
      roughnessMap: grayToDataTex(rmap, S, S, true),
    };
  });
}

export function woodGripPBR() {
  return cached('woodGripPBR', () => {
    const S = 256;
    const [c, ctx] = makeCanvas(S, S);
    const hmap = new Float32Array(S * S);
    const rmap = new Float32Array(S * S);
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const v = y / S;
        const swirl = tileFbm(u * 2, v * 8, 8, 4);
        const ring = Math.sin(v * 34 + swirl * 10) * 0.5 + 0.5;
        const shade = 0.65 + ring * 0.35 + (swirl - 0.5) * 0.2;
        const idx = (y * S + x) * 4;
        img.data[idx] = Math.min(255, 118 * shade);
        img.data[idx + 1] = Math.min(255, 68 * shade);
        img.data[idx + 2] = Math.min(255, 34 * shade);
        img.data[idx + 3] = 255;
        hmap[y * S + x] = 0.45 + ring * 0.35;
        rmap[y * S + x] = 0.44 + (1 - ring) * 0.22;
      }
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: finishTex(c, true, true),
      normalMap: heightToNormalTex(hmap, S, S, 1.9, true),
      roughnessMap: grayToDataTex(rmap, S, S, true),
    };
  });
}

export function muzzleFlashTexture() {
  return cached('muzzleFlashTex', () => {
    const S = 256;
    const [c, ctx] = makeCanvas(S, S);
    ctx.clearRect(0, 0, S, S);
    const cx = S / 2;
    const cy = S / 2;

    // Hot outer orange halo
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 122);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,244,185,0.95)');
    g.addColorStop(0.45, 'rgba(255,165,45,0.55)');
    g.addColorStop(0.78, 'rgba(255,95,15,0.16)');
    g.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);

    // Sharp directional plasma spikes
    for (let i = 0; i < 6; i++) {
      const ang = (i * Math.PI) / 3 + (i % 2 ? 0.14 : -0.1);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      const sg = ctx.createLinearGradient(0, 0, 122, 0);
      sg.addColorStop(0, 'rgba(255,255,240,0.95)');
      sg.addColorStop(0.35, 'rgba(255,200,80,0.75)');
      sg.addColorStop(1, 'rgba(255,110,20,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(122, 0);
      ctx.lineTo(0, 14);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    return finishTex(c, false, true);
  });
}

export function ammoBoxTexture(kind = 'rifle') {
  return cached('ammoBox_' + kind, () => {
    const S = 128;
    const [c, ctx] = makeCanvas(S, S);
    const bg =
      kind === 'shotgun'
        ? '#7f1d1d'
        : kind === 'pistol'
          ? '#1e3a5f'
          : kind === 'sniper'
            ? '#33404a'
            : kind === 'grenade'
              ? '#3f4d28'
              : '#364526';
    const band = kind === 'shotgun' ? '#f59e0b' : kind === 'pistol' ? '#60a5fa' : kind === 'sniper' ? '#e2e8f0' : kind === 'grenade' ? '#ef4444' : '#facc15';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, S, 550, 0.14);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, S - 8, S - 8);
    ctx.fillStyle = band;
    ctx.fillRect(10, 44, S - 20, 40);
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = kind === 'shotgun' ? '12G' : kind === 'pistol' ? '9MM' : kind === 'sniper' ? '7.62' : kind === 'grenade' ? 'FRAG' : '5.56';
    ctx.fillText(label, S / 2, S / 2 + 1);
    return finishTex(c, false, true);
  });
}

// ---------- Blood FX textures ----------
export function bloodDropTexture() {
  return cached('bloodDrop', () => {
    const S = 64;
    const [c, ctx] = makeCanvas(S, S);
    const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.42, 'rgba(255,255,255,0.92)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 32, 31, 0, Math.PI * 2);
    ctx.fill();
    return finishTex(c, false, true);
  });
}

export function bloodSplatTexture() {
  return cached('bloodSplat', () => {
    const S = 256;
    const [c, ctx] = makeCanvas(S, S);
    const rnd = mulberry32(7717);
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(88,6,6,0.95)';
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * 54;
      const cx = 128 + Math.cos(a) * r;
      const cy = 128 + Math.sin(a) * r;
      const rad = 16 + rnd() * 34;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rad, rad * (0.55 + rnd() * 0.6), a, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 80; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 70 + rnd() * 52;
      const cx = 128 + Math.cos(a) * r;
      const cy = 128 + Math.sin(a) * r;
      ctx.beginPath();
      ctx.arc(cx, cy, 1.5 + rnd() * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    return finishTex(c, false, true);
  });
}

export function cabinLogPBR() {
  return cached('cabinLogPBR', () => {
    const S = 256;
    const [c, ctx] = makeCanvas(S, S);
    const hmap = new Float32Array(S * S);
    const rmap = new Float32Array(S * S);
    const img = ctx.createImageData(S, S);
    const logH = 32;
    for (let y = 0; y < S; y++) {
      const ly = y % logH;
      const arc = Math.sin((ly / logH) * Math.PI);
      const chink = ly < 3 || ly > logH - 3;
      for (let x = 0; x < S; x++) {
        const grain = tileFbm((x / S) * 1.4, (y / S) * 6, 8, 3);
        const shade = chink ? 0.55 : 0.65 + arc * 0.38 + (grain - 0.5) * 0.24;
        const idx = (y * S + x) * 4;
        img.data[idx] = Math.min(255, (chink ? 168 : 118) * shade);
        img.data[idx + 1] = Math.min(255, (chink ? 156 : 82) * shade);
        img.data[idx + 2] = Math.min(255, (chink ? 138 : 52) * shade);
        img.data[idx + 3] = 255;
        hmap[y * S + x] = chink ? 0.18 : 0.35 + arc * 0.55;
        rmap[y * S + x] = chink ? 0.95 : 0.78 + (1 - grain) * 0.16;
      }
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: finishTex(c, true, true),
      normalMap: heightToNormalTex(hmap, S, S, 2.4, true),
      roughnessMap: grayToDataTex(rmap, S, S, true),
    };
  });
}

export function industrialWallPBR(accent = '#d97706') {
  return cached('industrialWallPBR_' + accent, () => {
    const S = 256;
    const [c, ctx] = makeCanvas(S, S);
    const hmap = new Float32Array(S * S);
    const rmap = new Float32Array(S * S);
    const img = ctx.createImageData(S, S);
    const ac = new THREE.Color(accent);
    for (let y = 0; y < S; y++) {
      const v = y / S;
      const stripe = v > 0.74 && v < 0.82;
      const lower = v >= 0.82;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const rib = Math.sin(u * Math.PI * 32) * 0.5 + 0.5;
        const n = tileFbm(u * 2, v * 2, 8, 3);
        const shade = 0.78 + rib * 0.2 + (n - 0.5) * 0.18;
        let r = (lower ? 92 : 142) * shade;
        let g = (lower ? 96 : 148) * shade;
        let b = (lower ? 100 : 154) * shade;
        if (stripe) {
          r = ac.r * 235 * shade;
          g = ac.g * 235 * shade;
          b = ac.b * 235 * shade;
        }
        const idx = (y * S + x) * 4;
        img.data[idx] = Math.min(255, r);
        img.data[idx + 1] = Math.min(255, g);
        img.data[idx + 2] = Math.min(255, b);
        img.data[idx + 3] = 255;
        hmap[y * S + x] = 0.35 + rib * 0.5;
        rmap[y * S + x] = stripe ? 0.55 : 0.62 + (1 - n) * 0.22;
      }
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: finishTex(c, true, true),
      normalMap: heightToNormalTex(hmap, S, S, 2.3, true),
      roughnessMap: grayToDataTex(rmap, S, S, true),
    };
  });
}

export function ceilingTilePBR() {
  return cached('ceilingTilePBR', () => {
    const S = 256;
    const [c, ctx] = makeCanvas(S, S);
    const hmap = new Float32Array(S * S);
    const rmap = new Float32Array(S * S);
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const grid = x % 64 < 3 || y % 64 < 3;
        const n = tileFbm(x / S, y / S, 8, 2);
        const v = grid ? 132 : 204 + (n - 0.5) * 20;
        const idx = (y * S + x) * 4;
        img.data[idx] = v;
        img.data[idx + 1] = v - 2;
        img.data[idx + 2] = v - 6;
        img.data[idx + 3] = 255;
        hmap[y * S + x] = grid ? 0.25 : 0.72 + n * 0.08;
        rmap[y * S + x] = grid ? 0.65 : 0.88;
      }
    }
    ctx.putImageData(img, 0, 0);
    return {
      map: finishTex(c, true, true),
      normalMap: heightToNormalTex(hmap, S, S, 1.6, true),
      roughnessMap: grayToDataTex(rmap, S, S, true),
    };
  });
}

export function rugPBR(seed = 0) {
  return cached('rugPBR_' + seed, () => {
    const S = 128;
    const [c, ctx] = makeCanvas(S, S);
    const bases = ['#7c2d23', '#274c5e', '#4b5b36', '#6b4728'];
    const trims = ['#d4a373', '#94a3b8', '#cbd5c0', '#e9c46a'];
    ctx.fillStyle = bases[seed % bases.length];
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = trims[seed % trims.length];
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, S - 20, S - 20);
    ctx.lineWidth = 3;
    ctx.strokeRect(22, 22, S - 44, S - 44);
    speckle(ctx, S, S, 900, 0.16);
    return finishTex(c, false, true);
  });
}

// ---------- Crushed Gravel Shoulder PBR & Reflective Puddle Alpha Mask ----------
export function gravelPBR(snow = false) {
  return cached('gravelPBR_' + (snow ? 'snow' : 'dry'), () => {
    const S = 256;
    const [c, ctx] = makeCanvas(S, S);
    const hmap = new Float32Array(S * S);
    const rmap = new Float32Array(S * S);
    const rnd = mulberry32(snow ? 611 : 601);

    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const macro = tileFbm(x / S, y / S, 6, 3);
        const pebble = tileFbm(x / S, y / S, 28, 3);
        const stone = (rnd() - 0.5) * 0.22;
        const base = (snow ? 135 : 94) + (macro - 0.5) * 28 + (pebble - 0.5) * 34 + stone * 60;
        const idx = (y * S + x) * 4;
        img.data[idx] = Math.max(24, Math.min(240, base));
        img.data[idx + 1] = Math.max(24, Math.min(240, base - (snow ? 0 : 4)));
        img.data[idx + 2] = Math.max(24, Math.min(240, base + (snow ? 12 : -10)));
        img.data[idx + 3] = 255;
        hmap[y * S + x] = 0.45 + pebble * 0.42 + stone * 0.25;
        rmap[y * S + x] = Math.max(0.45, Math.min(0.98, (snow ? 0.72 : 0.88) - macro * 0.25));
      }
    }
    ctx.putImageData(img, 0, 0);
    // Crisp scatter stones
    for (let i = 0; i < 420; i++) {
      const px = rnd() * S;
      const py = rnd() * S;
      const rad = 1 + rnd() * 2.5;
      const v = Math.floor((snow ? 150 : 75) + rnd() * 75);
      ctx.fillStyle = `rgb(${v},${v},${v + (snow ? 10 : -5)})`;
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    return {
      map: finishTex(c, true, true),
      normalMap: heightToNormalTex(hmap, S, S, 2.5, true),
      roughnessMap: grayToDataTex(rmap, S, S, true),
    };
  });
}

export function puddleMaskTexture() {
  return cached('puddleMaskTex', () => {
    const S = 128;
    const [c, ctx] = makeCanvas(S, S);
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = (x - S * 0.5) / (S * 0.42);
        const dy = (y - S * 0.5) / (S * 0.42);
        const warp = (fbm((x / S) * 3.8 + 4.2, (y / S) * 3.8 + 1.9, 4) - 0.5) * 0.52;
        const d = Math.hypot(dx, dy) + warp;
        const alpha = Math.max(0, Math.min(1, (1 - d) * 3.2));
        const rim = Math.max(0, Math.min(1, (d - 0.65) * 2.4)) * alpha;
        const idx = (y * S + x) * 4;
        img.data[idx] = Math.round(145 - rim * 60);
        img.data[idx + 1] = Math.round(165 - rim * 55);
        img.data[idx + 2] = Math.round(178 - rim * 50);
        img.data[idx + 3] = Math.round(alpha * 225);
      }
    }
    ctx.putImageData(img, 0, 0);
    return finishTex(c, false, true);
  });
}

// ---------- Sun-Baked Cracked Drought Soil PBR ----------
export function droughtPBR() {
  return cached('droughtPBR', () => {
    const S = 256;
    const [c, ctx] = makeCanvas(S, S);
    const hmap = new Float32Array(S * S);
    const rmap = new Float32Array(S * S);
    const rnd = mulberry32(4049);

    // Tileable Voronoi seeds (wrap 3x3) for sharp desiccated mud-crack plates
    const seeds = [];
    for (let i = 0; i < 42; i++) {
      seeds.push([rnd(), rnd()]);
    }

    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const n = tileFbm(u, v, 6, 3);
        const fine = tileFbm(u, v, 22, 2);

        // Closest and second-closest Voronoi seed distance (wrapped around 0..1 tile)
        let d1 = 99;
        let d2 = 99;
        const warpU = (n - 0.5) * 0.045;
        const warpV = (fine - 0.5) * 0.045;
        for (let i = 0; i < seeds.length; i++) {
          let dx = Math.abs(u + warpU - seeds[i][0]);
          let dy = Math.abs(v + warpV - seeds[i][1]);
          if (dx > 0.5) dx = 1 - dx;
          if (dy > 0.5) dy = 1 - dy;
          const dist = Math.hypot(dx, dy);
          if (dist < d1) {
            d2 = d1;
            d1 = dist;
          } else if (dist < d2) {
            d2 = dist;
          }
        }
        const edge = d2 - d1;
        const crack = Math.max(0, Math.min(1, 1 - edge / 0.017));
        const plateLip = Math.max(0, 1 - Math.abs(edge - 0.022) / 0.015) * 0.14;
        const dust = (rnd() - 0.5) * 0.09;

        const shade = (1 - crack * 0.68) * (0.86 + n * 0.24 + fine * 0.1 + plateLip + dust);
        const idx = (y * S + x) * 4;
        img.data[idx] = Math.max(18, Math.min(235, Math.round(166 * shade)));
        img.data[idx + 1] = Math.max(15, Math.min(220, Math.round(134 * shade)));
        img.data[idx + 2] = Math.max(12, Math.min(200, Math.round(92 * shade)));
        img.data[idx + 3] = 255;

        hmap[y * S + x] = Math.max(0, 0.72 - crack * 0.7 + plateLip + fine * 0.15);
        rmap[y * S + x] = Math.min(0.99, 0.9 + crack * 0.08);
      }
    }
    ctx.putImageData(img, 0, 0);

    return {
      map: finishTex(c, true, true),
      normalMap: heightToNormalTex(hmap, S, S, 3.4, true),
      roughnessMap: grayToDataTex(rmap, S, S, true),
    };
  });
}

// ---------- Boot Sole Footprint & Water Splash Ripple Textures ----------
export function footprintTexture() {
  return cached('footprintTex', () => {
    const S = 128;
    const [c, ctx] = makeCanvas(S, S);
    ctx.clearRect(0, 0, S, S);

    ctx.fillStyle = '#ffffff';
    // Forefoot sole
    ctx.beginPath();
    ctx.ellipse(64, 42, 22, 30, 0, 0, Math.PI * 2);
    ctx.fill();

    // Heel block
    ctx.beginPath();
    ctx.roundRect(45, 78, 38, 34, 12);
    ctx.fill();

    // Cut tread lug grooves for crisp boot impression
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000000';
    for (const ty of [26, 39, 52, 65, 90, 102]) {
      ctx.fillRect(36, ty, 56, 4);
    }
    ctx.fillRect(42, 70, 44, 9);
    ctx.globalCompositeOperation = 'source-over';
    return finishTex(c, false, true);
  });
}

export function rippleRingTexture() {
  return cached('rippleRingTex', () => {
    const S = 128;
    const [c, ctx] = makeCanvas(S, S);
    ctx.clearRect(0, 0, S, S);
    const rings = [
      { r: 52, w: 3.5, a: 0.92 },
      { r: 36, w: 2.5, a: 0.65 },
      { r: 20, w: 2.0, a: 0.42 },
    ];
    for (const rg of rings) {
      ctx.strokeStyle = `rgba(218, 240, 255, ${rg.a})`;
      ctx.lineWidth = rg.w;
      ctx.beginPath();
      ctx.arc(64, 64, rg.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    return finishTex(c, false, true);
  });
}


