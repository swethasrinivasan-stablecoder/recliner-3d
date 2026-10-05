// room.js — a light, cosy Scandinavian living room around the sofa.
//
// WORLD frame (unlike the sofa modules): the sofa's back face is at z = 0, it is
// centred on x (−1.86 → +1.86), seat fronts at z 1.02, the chaise reaches z 1.72
// on the left. The app owns the main lights and the facing wall at z = 5.5; this
// file builds the floor, three single-sided walls (back, window wall, right), the
// window with sheers, the rug, the styling furniture ('decor') and the sofa's
// cushions + throw ('pillows').
//
// Walls are single-sided (they face into the room) so an orbiting camera outside
// sees straight through them; anything mounted on a wall (window, curtains, art,
// skirting) is skipped at draw time while the camera is on the far side of it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DIM, worldUV } from './core.js';
import { M, WALL_COLOURS } from './materials.js';

const TAU = Math.PI * 2;
const { lerp, clamp, degToRad } = THREE.MathUtils;
const sstep = (a, b, t) => { t = clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const ROOM = { x0: -3.6, x1: 3.6, z0: -0.15, z1: 5.5, h: 2.7 };
const WIN = { z0: 1.30, z1: 3.50, y0: 0.46, y1: 2.36, reveal: 0.24, frameX: -3.80 };
const RUG = { cx: 0.3, cz: 1.85, w: 3.0, d: 2.2, top: 0.0115 };
const SKIRT = { h: 0.08, t: 0.012 };
// Real floor-plan details (set by createRoom({ plan })): openings in the east wall,
// where the TV/bedroom wall ends, and how far the corridor runs past it.
const PLAN = { east: null, tvWallEnd: 0, corridor: 1.2 };

// ===========================================================================
// Procedural textures
// ===========================================================================
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
// Tileable value noise: wraps every px cells in x and py cells in y.
function makeNoise(seed, px, py = px) {
  const r = rng(seed), g = new Float32Array(px * py);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let xf = x - xi, yf = y - yi;
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py;
    const x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
    const a = g[y0 * px + x0], b = g[y0 * px + x1], c = g[y1 * px + x0], d = g[y1 * px + x1];
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}
function fbm(n, x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); norm += a; a *= 0.5; f *= 2.03; }
  return s / norm;
}
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
// Per-pixel painter: fn(x, y, out) writes 0–255 rgb into out.
function paint(w, h, fn) {
  const c = makeCanvas(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data, o = [0, 0, 0];
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4) { fn(x, y, o); d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = 255; }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
// Height field (Float32Array w×h, wraps) → tangent-space normal map canvas.
function normalCanvas(h, w, ht, strength) {
  return paint(w, ht, (x, y, o) => {
    const H = (xx, yy) => h[((yy + ht) % ht) * w + ((xx + w) % w)];
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    o[0] = (-dx / l * 0.5 + 0.5) * 255; o[1] = (dy / l * 0.5 + 0.5) * 255; o[2] = (1 / l * 0.5 + 0.5) * 255;
  });
}
function tex(c, { srgb = true, wrap = true, rx = 1, ry = 1, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = aniso;
  return t;
}
const cache = {};
const once = (k, fn) => cache[k] || (cache[k] = fn());

// Limewash plaster: a soft, low-contrast mottle (linear tone, multiplies the wall colour).
const plasterTex = () => once('plaster', () => {
  const S = 512, a = makeNoise(101, 4), b = makeNoise(103, 16), c = makeNoise(107, 64), d = makeNoise(109, 256);
  const cv = paint(S, S, (x, y, o) => {
    const u = x / S, v = y / S;
    const m = a(u * 4, v * 4) * 0.5 + b(u * 16, v * 16) * 0.32 + c(u * 64, v * 64) * 0.18;
    const t = 0.958 + 0.04 * m + 0.014 * (d(u * 256, v * 256) - 0.5);
    o[0] = o[1] = o[2] = Math.min(255, t * 255);
  });
  return tex(cv, { srgb: false, rx: 1 / 2.4, ry: 1 / 2.4 });
});

// Natural oak for furniture: fine straight grain along u (tileable, ~0.5 m per tile).
const oakGrainTex = () => once('oakGrain', () => {
  // 1 m per tile; straight, slowly wandering latewood lines + elongated pores
  const S = 512, a = makeNoise(121, 3, 6), b = makeNoise(123, 24), p = makeNoise(127, 16, 384), m = makeNoise(129, 4);
  const cv = paint(S, S, (x, y, o) => {
    const u = x / S, v = y / S;
    const w = a(u * 3, v * 6) * 1.8 + b(u * 24, v * 24) * 0.05;
    const ring = Math.pow(0.5 + 0.5 * Math.cos((v * 44 + w) * TAU), 6);
    const pore = p(u * 16, v * 384);
    const t = (1 - 0.11 * ring - 0.04 * b(u * 24, v * 24) - (pore > 0.72 ? 0.03 : 0)) * (0.97 + 0.05 * m(u * 4, v * 4));
    o[0] = 228 * t; o[1] = 206 * t; o[2] = 174 * t;
  });
  return tex(cv, { srgb: true });
});

// Plain linen weave (linear tone) for the lamp shade and sheers.
const linenTex = () => once('linen', () => {
  const S = 256, n = makeNoise(141, 4, 64), m = makeNoise(143, 128);
  const cv = paint(S, S, (x, y, o) => {
    const u = x / S, v = y / S;
    const wu = 0.5 + 0.5 * Math.sin(u * 80 * TAU), wv = 0.5 + 0.5 * Math.sin(v * 80 * TAU);
    const slub = n(u * 4, v * 64);
    const t = 0.9 + 0.05 * Math.max(wu, wv) + 0.05 * slub + 0.02 * (m(u * 128, v * 128) - 0.5);
    o[0] = o[1] = o[2] = Math.min(255, t * 255);
  });
  return tex(cv, { srgb: false });
});

// --- floors (metre UVs on the floor; each texture carries its own repeat) ---
function stoneFloorMaterial() {
  // Large-format warm porcelain: 3×3 tiles of 0.9 m per texture tile, 5 mm joints.
  const S = 1024, N = 3, span = 2.7, tile = S / N;
  const r = rng(401);
  const tones = Array.from({ length: N * N }, () => [0.978 + r() * 0.04, r() * 2 - 1, r() * 10, r()]);
  const a = makeNoise(411, 6), b = makeNoise(413, 24), c = makeNoise(417, 96), d = makeNoise(419, 512), e = makeNoise(421, 12);
  const joint = (p) => { const l = p % tile; return Math.min(l, tile - l); };
  const col = paint(S, S, (x, y, o) => {
    if (joint(x + 0.5) < 1.05 || joint(y + 0.5) < 1.05) { o[0] = 196; o[1] = 190; o[2] = 180; return; }
    const tx = Math.floor(x / tile), ty = Math.floor(y / tile), T = tones[ty * N + tx];
    const u = x / S, v = y / S;
    const cloud = a(u * 6 + T[2], v * 6) * 0.55 + b(u * 24, v * 24) * 0.3 + c(u * 96, v * 96) * 0.15;
    const vein = T[3] > 0.35 ? Math.pow(1 - Math.abs(Math.sin((u * 3 + v * 2 + e(u * 12, v * 12) * 1.7 + T[3]) * Math.PI)), 22) * 0.03 : 0;
    const sp = d(u * 512, v * 512);
    const t = T[0] * (0.985 + 0.032 * (cloud - 0.5)) - vein - (sp > 0.83 ? 0.022 : 0) + (sp < 0.1 ? 0.01 : 0);
    o[0] = 222 * t + T[1] * 1.5; o[1] = 219 * t; o[2] = 213 * t - T[1] * 1.5;
  });
  const R = 256, rt = R / N;
  const rough = paint(R, R, (x, y, o) => {
    const jx = (x + 0.5) % rt, jy = (y + 0.5) % rt;
    const j = Math.min(jx, rt - jx, jy, rt - jy) < 0.75;
    o[0] = o[1] = o[2] = j ? 235 : 80 + 14 * c(x / R * 96, y / R * 96);
  });
  const off = [(-ROOM.x0) / span, (-ROOM.z0) / span];   // tile joints line up with the walls
  const map = tex(col, { rx: 1 / span, ry: 1 / span });
  const rmap = tex(rough, { srgb: false, rx: 1 / span, ry: 1 / span });
  map.offset.set(...off); rmap.offset.set(...off);
  return new THREE.MeshStandardMaterial({ map, roughnessMap: rmap, roughness: 1, metalness: 0, envMapIntensity: 0.9 });
}

function oakFloorMaterial() {
  // Pale white-oiled oak: 20 cm planks along x, random lengths, 4 m × 2 m per tile.
  const W = 2048, H = 1024, SX = 4.0, SZ = 2.0, PW = 0.2, ROWS = 10;
  const r = rng(77);
  const rows = [];
  for (let k = 0; k < ROWS; k++) {
    const start = r() * SX, cuts = [start];
    let p = start;
    for (;;) { const L = 0.95 + r() * 1.25; if (p + L > start + SX - 0.7) break; p += L; cuts.push(p); }
    rows.push({
      start,
      planks: cuts.map((c0, i) => ({
        a: c0, b: i + 1 < cuts.length ? cuts[i + 1] : start + SX,
        tone: 0.955 + r() * 0.07, warm: r() * 2 - 1, phase: r() * 20, dens: 0.75 + r() * 0.6,
        cath: r() < 0.55, mid: 0.3 + r() * 0.4, knot: r() < 0.18 ? [0.15 + r() * 0.7, 0.2 + r() * 0.6] : null,
      })),
    });
  }
  const nA = makeNoise(501, 16, 64), nB = makeNoise(503, 64, 64), nC = makeNoise(507, 512, 64), nD = makeNoise(509, 8);
  const col = paint(W, H, (x, y, o) => {
    const xm = (x + 0.5) / W * SX, zm = (y + 0.5) / H * SZ;
    const k = Math.min(ROWS - 1, Math.floor(zm / PW)), lv = zm / PW - k;
    const row = rows[k];
    let xr = xm; if (xr < row.start) xr += SX;
    let pl = row.planks[row.planks.length - 1];
    for (const q of row.planks) if (xr >= q.a && xr < q.b) { pl = q; break; }
    const len = pl.b - pl.a, lu = (xr - pl.a) / len;
    const gx = xm / SX;
    const w1 = nA(gx * 16, k * 6 + lv * 3), w2 = nB(gx * 64, k * 6 + lv * 6);
    let g;
    if (pl.cath) {
      const dv = (lv - 0.5 - 0.22 * (w1 - 0.5)) * 2;
      g = dv * dv * 5.5 * pl.dens + (lu - pl.mid) * len * 1.6 + w1 * 1.2 + pl.phase;
    } else {
      g = lv * 7 * pl.dens + w1 * 2.2 + w2 * 0.4 + pl.phase;
    }
    const ring = Math.pow(0.5 + 0.5 * Math.cos(g * TAU), 6);
    const pore = nC(gx * 512, k * 6 + lv * 40) > 0.76 ? 0.03 : 0;
    let t = pl.tone * (1 - 0.1 * ring - 0.035 * w2 - pore) * (0.985 + 0.03 * nD(gx * 8, zm / SZ * 8));
    if (pl.knot) {
      const dk = Math.hypot((lu - pl.knot[0]) * len * 14, (lv - pl.knot[1]) * 2.2);
      t *= 1 - 0.22 * Math.exp(-dk * dk * 6) - 0.06 * Math.exp(-dk * dk * 0.8);
    }
    // joints: long-edge micro-bevel + butt joints
    const ev = Math.min(lv, 1 - lv) * PW, eu = Math.min(xr - pl.a, pl.b - xr);
    if (ev < 0.0014 || eu < 0.0012) t *= 0.74;
    else if (ev < 0.003) t *= 0.95;
    o[0] = 231 * t + pl.warm * 3; o[1] = 219 * t; o[2] = 199 * t - pl.warm * 3;
  });
  const map = tex(col, { rx: 1 / SX, ry: 1 / SZ, aniso: 12 });
  return new THREE.MeshStandardMaterial({ map, roughness: 0.6, metalness: 0, envMapIntensity: 0.7 });
}

// --- rug: ivory / sand / soft-grey marbled, flowing wavy bands, carved pile ---
const rugMaterial = () => once('rug', () => {
  const W = 1024, H = 752;
  const n1 = makeNoise(301, 64), n2 = makeNoise(302, 64), n3 = makeNoise(303, 64), n4 = makeNoise(304, 512), n5 = makeNoise(305, 64);
  const ivory = [241, 237, 229], sand = [221, 210, 192], grey = [196, 192, 185], taupe = [168, 161, 150];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const hgt = new Float32Array(W * H);
  const col = paint(W, H, (x, y, o) => {
    const X = x / W * 3.0, Y = y / H * 2.2;
    // flow field: long diagonal waves, gently domain-warped so the striations
    // run mostly parallel (marbled / agate) instead of closing into contour loops
    const w1 = fbm(n1, X * 0.42, Y * 0.42, 5), w2 = fbm(n2, X * 1.3 + 3, Y * 1.3 + 1, 4);
    const t = X * 0.52 + Y * 1.15 + 1.25 * w1 + 0.22 * w2;
    const zone = sstep(0.4, 0.66, fbm(n3, X * 0.8 + 5, Y * 0.8 + 9, 3));   // where striations gather
    const zone2 = fbm(n5, X * 0.6 + 2, Y * 0.6 + 4, 3);
    const f1 = 0.5 + 0.5 * Math.cos(TAU * (t * 26 + 0.8 * w2));
    const f2 = 0.5 + 0.5 * Math.cos(TAU * (t * 8.5 + 0.5 * w2));
    const lines = Math.pow(f1, 5) * (0.12 + 0.88 * zone) * 0.55 + Math.pow(f2, 16) * (0.25 + 0.75 * zone) * 0.7;
    const broad = sstep(0.3, 0.9, 0.5 + 0.5 * Math.cos(TAU * (t * 1.7 + 0.25 + zone2)));
    let c = mix(ivory, sand, broad * 0.42);
    c = mix(c, grey, zone * 0.5 * (0.35 + 0.65 * f2));
    c = mix(c, taupe, lines * 0.38);
    const fib = (n4(x / W * 512, y / H * 376) - 0.5) * 0.045;
    const s = 1 + fib;
    o[0] = c[0] * s; o[1] = c[1] * s; o[2] = c[2] * s;
    hgt[y * W + x] = 1 - 0.75 * lines - 0.12 * zone * f2 + fib * 2.5;
  });
  const nrm = normalCanvas(hgt, W, H, 2.6);
  return new THREE.MeshPhysicalMaterial({
    map: tex(col, { wrap: false }), normalMap: tex(nrm, { srgb: false, wrap: false }), normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 1, sheen: 0.55, sheenRoughness: 0.75, sheenColor: new THREE.Color('#ffffff'),
  });
});

// --- knit (pouf): stockinette V stitches ---
const knitTextures = () => once('knit', () => {
  const S = 128, C = 4, R = 4, h = new Float32Array(S * S);
  const leg = (px, py, cx, ang) => {
    const dx = px - cx, dy = py - 0.5, ca = Math.cos(ang), sa = Math.sin(ang);
    const u = dx * ca - dy * sa, v = dx * sa + dy * ca;
    const d = (u / 0.2) ** 2 + (v / 0.56) ** 2;
    return d < 1 ? Math.sqrt(1 - d) : 0;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const cu = (x / S * C) % 1, cv = (y / S * R) % 1;
    let v = 0;
    for (const off of [-1, 0, 1]) v = Math.max(v, leg(cu, cv + off, 0.27, 0.42), leg(cu, cv + off, 0.73, -0.42));
    h[y * S + x] = v;
  }
  const tone = paint(S, S, (x, y, o) => { o[0] = o[1] = o[2] = (0.74 + 0.26 * h[y * S + x]) * 255; });
  return { tone: tex(tone, { srgb: false }), normal: tex(normalCanvas(h, S, S, 2.6), { srgb: false }) };
});

// --- framed art: soft abstract shapes in the palette, printed on a white mat ---
function artCanvas(kind, W, H, mat, seed) {
  const c = makeCanvas(W, H), x = c.getContext('2d');
  const P = { paper: '#efe9df', clay: '#c3866a', ochre: '#cfa461', sand: '#dbc7a5', sage: '#a4ad94', moss: '#7c8566', mist: '#cacbc3', fjord: '#8fa1ad', ink: '#3d4244', blush: '#d9b7a6' };
  x.fillStyle = '#f7f4ee'; x.fillRect(0, 0, W, H);
  const ax = mat, ay = mat, aw = W - 2 * mat, ah = H - 2 * mat;
  if (mat > 0) {   // bevel-cut window in the mat
    x.fillStyle = '#fffdf9'; x.fillRect(ax - 4, ay - 4, aw + 8, ah + 8);
    x.fillStyle = '#e3dccf'; x.fillRect(ax - 4, ay - 4, aw + 8, 4); x.fillRect(ax - 4, ay - 4, 4, ah + 8);
  }
  x.save();
  x.beginPath(); x.rect(ax, ay, aw, ah); x.clip();
  x.translate(ax, ay);
  x.fillStyle = P.paper; x.fillRect(0, 0, aw, ah);
  const circle = (cx, cy, rr, col) => { x.fillStyle = col; x.beginPath(); x.arc(cx, cy, rr, 0, TAU); x.fill(); };
  const arch = (x0, y0, w, h, col) => {
    x.fillStyle = col; x.beginPath(); x.moveTo(x0, y0 + h); x.lineTo(x0, y0 + w / 2);
    x.arc(x0 + w / 2, y0 + w / 2, w / 2, Math.PI, 0); x.lineTo(x0 + w, y0 + h); x.closePath(); x.fill();
  };
  if (kind === 'arch') {
    arch(aw * 0.38, ah * 0.36, aw * 0.48, ah * 0.7, P.sand);
    arch(aw * 0.12, ah * 0.47, aw * 0.42, ah * 0.6, P.clay);
    circle(aw * 0.71, ah * 0.2, aw * 0.115, P.ochre);
    x.strokeStyle = P.ink; x.lineWidth = Math.max(1.5, aw * 0.006);
    x.beginPath(); x.moveTo(aw * 0.0, ah * 0.885); x.lineTo(aw * 1.0, ah * 0.885); x.stroke();
  } else if (kind === 'dunes') {
    circle(aw * 0.66, ah * 0.33, ah * 0.13, '#e4c597');
    const hill = (y0, amp, ph, col, k = 1) => {
      x.fillStyle = col; x.beginPath(); x.moveTo(0, ah);
      for (let i = 0; i <= 60; i++) { const t = i / 60; x.lineTo(t * aw, ah * (y0 - amp * Math.sin(t * Math.PI * k + ph) - amp * 0.35 * Math.sin(t * 7.3 + ph * 2))); }
      x.lineTo(aw, ah); x.closePath(); x.fill();
    };
    hill(0.62, 0.10, 0.6, P.mist, 1.3);
    hill(0.70, 0.08, 2.2, P.sage, 1.7);
    hill(0.79, 0.07, 4.0, P.blush, 1.1);
    hill(0.88, 0.05, 1.2, P.moss, 2.1);
  } else {   // 'leaf'
    x.save(); x.translate(aw * 0.46, ah * 0.5); x.rotate(-0.42);
    const L = ah * 0.36, Wd = aw * 0.3;
    x.fillStyle = P.sage; x.beginPath(); x.moveTo(0, -L);
    x.quadraticCurveTo(Wd, -L * 0.1, 0, L); x.quadraticCurveTo(-Wd, -L * 0.1, 0, -L); x.fill();
    x.strokeStyle = P.paper; x.lineWidth = Math.max(1.5, aw * 0.008);
    x.beginPath(); x.moveTo(0, -L * 0.85); x.quadraticCurveTo(L * 0.05, 0, 0, L * 0.95); x.stroke();
    x.strokeStyle = P.ink; x.lineWidth = Math.max(1.5, aw * 0.007);
    x.beginPath(); x.moveTo(0, L * 0.95); x.quadraticCurveTo(-L * 0.04, L * 1.25, L * 0.12, L * 1.6); x.stroke();
    x.restore();
    circle(aw * 0.76, ah * 0.2, aw * 0.08, P.clay);
    x.fillStyle = P.fjord; x.beginPath(); x.arc(aw * 0.7, ah, aw * 0.2, Math.PI, 0); x.fill();
  }
  x.restore();
  // paper grain
  const img = x.getImageData(0, 0, W, H), d = img.data, r = rng(seed);
  for (let i = 0; i < d.length; i += 4) { const g = (r() - 0.5) * 7; d[i] += g; d[i + 1] += g; d[i + 2] += g; }
  x.putImageData(img, 0, 0);
  return c;
}

// --- view through the window: an over-exposed Nordic garden, heavily blurred ---
const exteriorTex = () => once('exterior', () => {
  const W = 1024, H = 512, c = makeCanvas(W, H), x = c.getContext('2d');
  const sky = x.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#dfe8ef'); sky.addColorStop(0.55, '#f3f3ee'); sky.addColorStop(0.62, '#e6e9dc'); sky.addColorStop(1, '#d3dbc4');
  x.fillStyle = sky; x.fillRect(0, 0, W, H);
  x.filter = 'blur(14px)';
  const r = rng(611);
  for (let i = 0; i < 26; i++) {   // soft tree line
    const cx = r() * W, cy = H * (0.42 + r() * 0.12), rw = 40 + r() * 90, rh = 60 + r() * 120;
    x.fillStyle = ['#b7c2a8', '#a9b59c', '#c5ccb8', '#9eab92'][i % 4];
    x.beginPath(); x.ellipse(cx, cy, rw, rh, 0, 0, TAU); x.fill();
  }
  x.fillStyle = '#e9ecdf'; x.fillRect(0, H * 0.58, W, H * 0.5);
  x.filter = 'blur(6px)';
  for (let i = 0; i < 7; i++) {   // pale birch trunks
    const tx = r() * W; x.fillStyle = 'rgba(244,242,236,0.85)'; x.fillRect(tx, H * 0.25, 6 + r() * 6, H * 0.4);
  }
  x.filter = 'none';
  return tex(c, { wrap: false });
});

// ===========================================================================
// Geometry helpers
// ===========================================================================
function mesh(geo, mat, { cast = true, receive = true, name } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = receive;
  if (name) m.name = name;
  return m;
}
function uvFromWorld(geo, a, b, sa = 1, sb = 1) {
  const p = geo.attributes.position.array, n = geo.attributes.position.count, uv = new Float32Array(n * 2);
  const ia = 'xyz'.indexOf(a), ib = 'xyz'.indexOf(b);
  for (let i = 0; i < n; i++) { uv[i * 2] = p[i * 3 + ia] * sa; uv[i * 2 + 1] = p[i * 3 + ib] * sb; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
function lathe(pts, segs = 48) {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), segs);
}
// Round slab profile (bottom centre → rim → top centre) with edge radius e.
function discProfile(R, T, e, n = 5) {
  const pts = [[0, 0], [R - e, 0]];
  for (let i = 1; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * Math.PI / 2; pts.push([R - e + e * Math.cos(a), e + e * Math.sin(a)]); }
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI / 2; pts.push([R - e + e * Math.cos(a), T - e + e * Math.sin(a)]); }
  pts.push([0, T]);
  return pts;
}
const _Y = V(0, 1, 0);
// Tapered round strut from a (radius r0) to b (radius r1).
function strut(a, b, r0, r1, mat, seg = 14) {
  const d = b.clone().sub(a), len = d.length();
  const m = mesh(new THREE.CylinderGeometry(r1, r0, len, seg), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(_Y, d.normalize());
  return m;
}
// Tube along a curve whose radius tapers from r0 to r1.
function taperTube(curve, r0, r1, segs = 16, radial = 7) {
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const p = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, c);
    const r = lerp(r0, r1, Math.pow(i / segs, 0.85));
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c);
      p.setXYZ(k, v.x, v.y, v.z);
    }
  }
  return g;
}
// Skip drawing (without touching visibility or the scene graph) while test(camera
// world position) is false — used for wall-mounted parts so a camera outside a
// single-sided wall sees through the whole wall, not just its plaster.
function renderIf(root, test, { cast = false } = {}) {
  function before(r, s, cam, g, mat) {
    const e = cam.matrixWorld.elements;
    if (!test(e[12], e[13], e[14])) {
      this.userData._hid = mat; this.userData._cw = mat.colorWrite; this.userData._dw = mat.depthWrite;
      mat.colorWrite = false; mat.depthWrite = false;
    }
  }
  function after() {
    const m = this.userData._hid;
    if (m) { m.colorWrite = this.userData._cw; m.depthWrite = this.userData._dw; this.userData._hid = null; }
  }
  root.traverse((o) => { if (o.isMesh) { o.onBeforeRender = before; o.onAfterRender = after; if (!cast) o.castShadow = false; } });
}
const inRoomX0 = (x) => x > ROOM.x0;
const inRoomX1 = (x) => x < ROOM.x1;
const inRoomZ0 = (x, y, z) => z > ROOM.z0;

// ===========================================================================
// Room shell: floor, walls, skirting, window, sheers, rug
// ===========================================================================
function skirtingGeo(len) {
  // profile (distance from wall, height): flat face with a softly rounded top
  const prof = [[SKIRT.t, 0], [SKIRT.t, SKIRT.h - 0.009], [SKIRT.t - 0.0012, SKIRT.h - 0.0045], [SKIRT.t - 0.0042, SKIRT.h - 0.0014], [SKIRT.t - 0.008, SKIRT.h - 0.0002], [0, SKIRT.h]];
  const pos = [], uv = [], idx = [];
  prof.forEach(([z, y]) => { pos.push(0, y, z, len, y, z); uv.push(0, y * 4, len * 4, y * 4); });
  for (let i = 0; i < prof.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function curtainGeo(width, height, { wave = 0.105, amp = 0.034, seed = 1 } = {}) {
  const nW = Math.round(width / wave) * 10, nH = 28;
  const g = new THREE.PlaneGeometry(width, height, nW, nH);
  const p = g.attributes.position, n = makeNoise(seed, 16);
  for (let i = 0; i < p.count; i++) {
    const s = p.getX(i) + width / 2, t = (p.getY(i) + height / 2) / height;   // t: 0 hem → 1 heading
    const a = amp * (0.82 + 0.36 * n(s * 6, 2)) * (1 + 0.28 * (1 - t) * (1 - t));
    const z = a * Math.sin((s / wave) * TAU + 0.3 * n(s * 2, t * 3)) + 0.012 * Math.sin(t * 2.4 + s * 1.7) * (1 - t);
    p.setZ(i, z);
    p.setX(i, (s - width / 2) * (1 + 0.035 * (1 - t) * (1 - t)));
  }
  g.computeVertexNormals();
  uvFromWorld(g, 'x', 'y', 6, 6);
  return g;
}

function buildShell(wallMat, skirtMat, oak) {
  const g = new THREE.Group(); g.name = 'shell';
  const fW = ROOM.x1 - ROOM.x0, fD = ROOM.z1 - ROOM.z0, cx = (ROOM.x0 + ROOM.x1) / 2, cz = (ROOM.z0 + ROOM.z1) / 2;

  // floor slab: top + thin cut edges (reads as a model when orbiting outside)
  const floorGeo = new THREE.PlaneGeometry(fW, fD).rotateX(-Math.PI / 2).translate(cx, 0, cz);
  uvFromWorld(floorGeo, 'x', 'z');
  const floor = mesh(floorGeo, null, { cast: false, name: 'Floor' });
  g.add(floor);
  const edgeMat = new THREE.MeshStandardMaterial({ color: '#cbc4b8', roughness: 0.95 });
  const ed = 0.06;
  const edge = (geo, x, z) => g.add(mesh(geo.translate(x, -ed / 2, z), edgeMat, { cast: false, receive: false }));
  edge(new THREE.PlaneGeometry(fW, ed), cx, ROOM.z1);
  edge(new THREE.PlaneGeometry(fW, ed).rotateY(Math.PI), cx, ROOM.z0);
  edge(new THREE.PlaneGeometry(fD, ed).rotateY(-Math.PI / 2), ROOM.x0, cz);
  edge(new THREE.PlaneGeometry(fD, ed).rotateY(Math.PI / 2), ROOM.x1, cz);

  // back wall (faces +z) and right wall (faces −x)
  const back = new THREE.PlaneGeometry(fW, ROOM.h).translate(cx, ROOM.h / 2, ROOM.z0);
  g.add(mesh(uvFromWorld(back, 'x', 'y'), wallMat, { cast: false, name: 'Back wall' }));
  if (PLAN.east) {
    // east side of the real flat: openings to the kitchen and the WC/hall; the wall
    // runs on past the TV wall along the corridor to the entré
    const zEnd = ROOM.z1 + PLAN.corridor;
    // shape coords are (z, y); rotating −90° about y maps them to (x1, y, z) facing −x
    const e = new THREE.Shape();
    e.moveTo(ROOM.z0, 0);
    for (const o of PLAN.east) { e.lineTo(o.z0, 0); e.lineTo(o.z0, o.h); e.lineTo(o.z1, o.h); e.lineTo(o.z1, 0); }
    e.lineTo(zEnd, 0); e.lineTo(zEnd, ROOM.h); e.lineTo(ROOM.z0, ROOM.h); e.closePath();
    const right = new THREE.ShapeGeometry(e).rotateY(-Math.PI / 2).translate(ROOM.x1, 0, 0);
    g.add(mesh(uvFromWorld(right, 'z', 'y'), wallMat, { cast: false, name: 'Kitchen / hall wall' }));
  } else {
    const right = new THREE.PlaneGeometry(fD, ROOM.h).rotateY(-Math.PI / 2).translate(ROOM.x1, ROOM.h / 2, cz);
    g.add(mesh(uvFromWorld(right, 'z', 'y'), wallMat, { cast: false, name: 'Right wall' }));
  }

  // window wall (faces +x) with the opening cut out; shape coords are (−z, y)
  const s = new THREE.Shape();
  s.moveTo(-ROOM.z1, 0); s.lineTo(-ROOM.z0, 0); s.lineTo(-ROOM.z0, ROOM.h); s.lineTo(-ROOM.z1, ROOM.h); s.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-WIN.z1, WIN.y0); hole.lineTo(-WIN.z1, WIN.y1); hole.lineTo(-WIN.z0, WIN.y1); hole.lineTo(-WIN.z0, WIN.y0); hole.closePath();
  s.holes.push(hole);
  const left = new THREE.ShapeGeometry(s).rotateY(Math.PI / 2).translate(ROOM.x0, 0, 0);
  g.add(mesh(uvFromWorld(left, 'z', 'y'), wallMat, { cast: false, name: 'Window wall' }));

  // skirting boards (painted the wall colour, satin)
  const sk = new THREE.Group();
  const skBack = new THREE.Group(), skLeft = new THREE.Group(), skRight = new THREE.Group();
  skBack.add(mesh(skirtingGeo(fW).translate(ROOM.x0, 0, ROOM.z0), skirtMat, { cast: false }));
  const zs0 = ROOM.z0 + SKIRT.t, zs1 = ROOM.z1 - SKIRT.t;   // the app's facing wall has its own skirting
  skLeft.add(mesh(skirtingGeo(zs1 - zs0).rotateY(Math.PI / 2).translate(ROOM.x0, 0, zs1), skirtMat, { cast: false }));
  if (PLAN.east) {
    let za = zs0;
    for (const o of [...PLAN.east, { z0: ROOM.z1 + PLAN.corridor, z1: 0 }]) {
      if (o.z0 - za > 0.02) skRight.add(mesh(skirtingGeo(o.z0 - za).rotateY(-Math.PI / 2).translate(ROOM.x1, 0, za), skirtMat, { cast: false }));
      za = o.z1;
    }
  } else skRight.add(mesh(skirtingGeo(zs1 - zs0).rotateY(-Math.PI / 2).translate(ROOM.x1, 0, zs0), skirtMat, { cast: false }));
  renderIf(skBack, inRoomZ0); renderIf(skLeft, inRoomX0); renderIf(skRight, inRoomX1);
  sk.add(skBack, skLeft, skRight);
  g.add(sk);

  // ---- window: deep plastered reveal, oak sill, slim black steel frame, glass ----
  const win = new THREE.Group(); win.name = 'window';
  const xr0 = ROOM.x0 - WIN.reveal, wz = WIN.z1 - WIN.z0, wy = WIN.y1 - WIN.y0, wzc = (WIN.z0 + WIN.z1) / 2;
  const revealMat = wallMat;
  const jambA = new THREE.PlaneGeometry(WIN.reveal, wy).translate(ROOM.x0 - WIN.reveal / 2, (WIN.y0 + WIN.y1) / 2, WIN.z0);
  const jambB = new THREE.PlaneGeometry(WIN.reveal, wy).rotateY(Math.PI).translate(ROOM.x0 - WIN.reveal / 2, (WIN.y0 + WIN.y1) / 2, WIN.z1);
  const head = new THREE.PlaneGeometry(WIN.reveal, wz).rotateX(Math.PI / 2).translate(ROOM.x0 - WIN.reveal / 2, WIN.y1, wzc);
  for (const geo of [jambA, jambB]) win.add(mesh(uvFromWorld(geo, 'x', 'y'), revealMat, { cast: false }));
  win.add(mesh(uvFromWorld(head, 'x', 'z'), revealMat, { cast: false }));
  const sillT = 0.035, sillTop = WIN.y0 + 0.012, sillD = WIN.reveal + 0.055;
  const sill = mesh(worldUV(new RoundedBoxGeometry(sillD, sillT, wz + 0.1, 2, 0.006).translate(xr0 + sillD / 2, sillTop - sillT / 2, wzc), 1.0), oak, { name: 'Oak window sill' });
  win.add(sill);
  const frameMat = new THREE.MeshStandardMaterial({ color: '#1e1f21', roughness: 0.42, metalness: 0.35 });
  const fd = 0.06, fx = WIN.frameX, fy0 = sillTop, fh = WIN.y1 - fy0;
  const bar = (dx, dy, dz, x, y, z) => win.add(mesh(new RoundedBoxGeometry(dx, dy, dz, 2, 0.003).translate(x, y, z), frameMat, { cast: false }));
  bar(fd, 0.05, wz, fx, WIN.y1 - 0.025, wzc);                 // head
  bar(fd, 0.05, wz, fx, fy0 + 0.025, wzc);                    // foot
  bar(fd, fh, 0.05, fx, fy0 + fh / 2, WIN.z0 + 0.025);        // jambs
  bar(fd, fh, 0.05, fx, fy0 + fh / 2, WIN.z1 - 0.025);
  for (const k of [1, 2]) bar(fd * 0.85, fh - 0.09, 0.032, fx, fy0 + fh / 2, WIN.z0 + (k * wz) / 3);   // mullions
  bar(fd * 0.85, 0.032, wz - 0.09, fx, 1.94, wzc);           // transom
  bar(0.014, 0.12, 0.014, fx + 0.04, 1.2, WIN.z0 + wz / 3 - 0.045);   // casement handle
  bar(0.024, 0.024, 0.02, fx + 0.03, 1.26, WIN.z0 + wz / 3 - 0.045);
  const glassMat = new THREE.MeshStandardMaterial({ color: '#e6eef2', transparent: true, opacity: 0.1, roughness: 0.04, metalness: 0, depthWrite: false });
  win.add(mesh(new THREE.PlaneGeometry(wz, fh).rotateY(Math.PI / 2).translate(fx - 0.005, fy0 + fh / 2, wzc), glassMat, { cast: false, receive: false }));
  renderIf(win, inRoomX0);
  g.add(win);

  // exterior backdrop — drawn only from inside the room; it stays within the wall's
  // footprint so it can only ever be seen through the opening
  const extMat = new THREE.MeshBasicMaterial({ map: exteriorTex(), color: new THREE.Color(1.12, 1.12, 1.12) });
  const ext = mesh(new THREE.PlaneGeometry(ROOM.z1 - ROOM.z0, ROOM.h + 0.2).rotateY(Math.PI / 2).translate(ROOM.x0 - 0.62, ROOM.h / 2 - 0.1, cz), extMat, { cast: false, receive: false, name: 'Garden view' });
  g.add(ext);

  // ---- sheer linen curtains on a slim black rod ----
  const cur = new THREE.Group(); cur.name = 'curtains';
  const sheer = new THREE.MeshStandardMaterial({
    color: '#f5f0e7', map: linenTex(), roughness: 0.95, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
    emissive: '#fff6e8', emissiveIntensity: 0.1, depthWrite: false,
  });
  const rodY = Math.min(2.53, ROOM.h - 0.07), rodX = ROOM.x0 + (PLAN.east ? 0.06 : 0.13), curTop = rodY - 0.035, curH = curTop - 0.012;
  const panels = [[WIN.z0 - 0.34, WIN.z0 + 0.32, 3], [WIN.z1 - 0.32, WIN.z1 + 0.34, 7]];
  for (const [za, zb, seed] of panels) {
    const w = zb - za;
    const geo = curtainGeo(w, curH, { seed }).rotateY(Math.PI / 2).translate(rodX, 0.012 + curH / 2, (za + zb) / 2);
    const m = mesh(geo, sheer, { cast: false, name: 'Sheer linen curtain' });
    m.renderOrder = 2;
    cur.add(m);
    for (let s = 0.105 / 4; s < w; s += 0.105) {   // rings at each fold crest
      const ring = mesh(new THREE.TorusGeometry(0.019, 0.0028, 6, 18).rotateY(Math.PI / 2), frameMat, { cast: false });
      ring.position.set(rodX + 0.004, rodY - 0.004, zb - s);
      cur.add(ring);
    }
  }
  const rodZ0 = WIN.z0 - 0.42, rodZ1 = WIN.z1 + 0.42;
  cur.add(strut(V(rodX, rodY, rodZ0), V(rodX, rodY, rodZ1), 0.0105, 0.0105, frameMat, 12));
  for (const z of [rodZ0, rodZ1]) { const f = mesh(new THREE.SphereGeometry(0.019, 14, 10), frameMat, { cast: false }); f.position.set(rodX, rodY, z + Math.sign(z - wzc) * 0.012); cur.add(f); }
  for (const z of [rodZ0 + 0.06, wzc, rodZ1 - 0.06]) {
    cur.add(strut(V(ROOM.x0, rodY, z), V(rodX, rodY, z), 0.006, 0.006, frameMat, 8));
    const plate = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 16).rotateZ(Math.PI / 2), frameMat, { cast: false });
    plate.position.set(ROOM.x0 + 0.003, rodY, z); cur.add(plate);
  }
  renderIf(cur, inRoomX0);
  g.add(cur);

  const floors = [floor];
  if (PLAN.east) {
    // corridor strip past the end of the TV wall, toward the entré
    const cw = ROOM.x1 - PLAN.tvWallEnd, cd = PLAN.corridor;
    const cf = new THREE.PlaneGeometry(cw, cd).rotateX(-Math.PI / 2).translate(PLAN.tvWallEnd + cw / 2, 0, ROOM.z1 + cd / 2);
    const corr = mesh(uvFromWorld(cf, 'x', 'z'), null, { cast: false, name: 'Hall floor' });
    g.add(corr); floors.push(corr);
    // bedroom wall end faces into the corridor
    const endW = new THREE.PlaneGeometry(cd, ROOM.h).rotateY(Math.PI / 2).translate(PLAN.tvWallEnd, ROOM.h / 2, ROOM.z1 + cd / 2);
    g.add(mesh(uvFromWorld(endW, 'z', 'y'), wallMat, { cast: false, name: 'Bedroom wall' }));
    // entré: far wall with the front door
    const fwG = new THREE.PlaneGeometry(cw, ROOM.h).rotateY(Math.PI).translate(PLAN.tvWallEnd + cw / 2, ROOM.h / 2, ROOM.z1 + cd);
    g.add(mesh(uvFromWorld(fwG, 'x', 'y'), wallMat, { cast: false, name: 'Entré' }));
    const doorMat = new THREE.MeshStandardMaterial({ color: '#f2f0eb', roughness: 0.6 });
    const door = mesh(new RoundedBoxGeometry(0.9, 2.05, 0.04, 2, 0.005), doorMat, { name: 'Front door' });
    door.position.set(PLAN.tvWallEnd + cw / 2, 1.025, ROOM.z1 + cd - 0.03);
    g.add(door);
    // kitchen glimpse through the opening
    const k = PLAN.east[0], kd = 1.3;
    const kf = new THREE.PlaneGeometry(kd, k.z1 - k.z0 + 0.6).rotateX(-Math.PI / 2).translate(ROOM.x1 + kd / 2, 0, (k.z0 + k.z1) / 2);
    const kfl = mesh(uvFromWorld(kf, 'x', 'z'), null, { cast: false, name: 'Kitchen floor' });
    g.add(kfl); floors.push(kfl);
    const kw = new THREE.PlaneGeometry(k.z1 - k.z0 + 0.6, ROOM.h).rotateY(-Math.PI / 2).translate(ROOM.x1 + kd, ROOM.h / 2, (k.z0 + k.z1) / 2);
    g.add(mesh(uvFromWorld(kw, 'z', 'y'), wallMat, { cast: false, name: 'Kitchen wall' }));
    const cab = new THREE.MeshStandardMaterial({ color: '#f4f3ef', roughness: 0.5 });
    const top = new THREE.MeshStandardMaterial({ color: '#cfb48e', roughness: 0.45 });
    const run = mesh(new RoundedBoxGeometry(0.6, 0.86, k.z1 - k.z0 + 0.5, 2, 0.006), cab, { name: 'Kitchen cabinets' });
    run.position.set(ROOM.x1 + kd - 0.3, 0.43, (k.z0 + k.z1) / 2); g.add(run);
    const wt = mesh(new RoundedBoxGeometry(0.62, 0.03, k.z1 - k.z0 + 0.52, 2, 0.006), top, { name: 'Oak worktop' });
    wt.position.set(ROOM.x1 + kd - 0.31, 0.875, (k.z0 + k.z1) / 2); g.add(wt);
    const upper = mesh(new RoundedBoxGeometry(0.35, 0.7, k.z1 - k.z0 + 0.5, 2, 0.006), cab, { name: 'Wall cabinets' });
    upper.position.set(ROOM.x1 + kd - 0.175, 1.85, (k.z0 + k.z1) / 2); g.add(upper);
    // ceiling (faces down, so an orbiting camera above sees straight through)
    const ceil = new THREE.PlaneGeometry(fW, fD).rotateX(Math.PI / 2).translate(cx, ROOM.h, cz);
    g.add(mesh(ceil, new THREE.MeshStandardMaterial({ color: '#f6f4ef', roughness: 0.95 }), { cast: false, receive: false, name: 'Ceiling' }));
    // wall tops drawn like the floor plan, visible from above only
    const capMat = new THREE.MeshBasicMaterial({ color: '#5a5d5f' });
    const cap = (x0, z0, x1, z1) => { const c = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, ROOM.h + 0.002, (z0 + z1) / 2), capMat); g.add(c); };
    const t = 0.12;
    cap(ROOM.x0 - t, ROOM.z0 - t, ROOM.x1 + t, ROOM.z0);                       // north
    cap(ROOM.x0 - t, ROOM.z0, ROOM.x0, WIN.z0);                                 // west, either side of the window
    cap(ROOM.x0 - t, WIN.z1, ROOM.x0, ROOM.z1 + t);
    cap(ROOM.x0 - t, ROOM.z1, PLAN.tvWallEnd, ROOM.z1 + t);                     // TV / bedroom wall
    cap(PLAN.tvWallEnd - t, ROOM.z1, PLAN.tvWallEnd, ROOM.z1 + PLAN.corridor);
    let za = ROOM.z0;
    for (const o of [...PLAN.east, { z0: ROOM.z1 + PLAN.corridor, z1: 0 }]) { if (o.z0 > za) cap(ROOM.x1, za, ROOM.x1 + t, o.z0); za = o.z1; }
    // panel radiator under the window
    const rad = new THREE.Group(); rad.name = 'Radiator';
    const radMat = new THREE.MeshStandardMaterial({ color: '#f3f2ee', roughness: 0.4, metalness: 0.1 });
    const rz0 = WIN.z0 + 0.12, rz1 = WIN.z1 - 0.12;
    for (let zz = rz0; zz < rz1; zz += 0.05) {
      const fin = mesh(new THREE.BoxGeometry(0.06, 0.52, 0.038), radMat, { name: 'Panel radiator' });
      fin.position.set(ROOM.x0 + 0.055, 0.42, zz + 0.019); rad.add(fin);
    }
    renderIf(rad, inRoomX0, { cast: true });
    g.add(rad);
  }
  return { group: g, floor, floors, ext, sheer };
}

function buildRug() {
  const bs = 0.005, bt = 0.0035, depth = 0.004, r = 0.03;
  const w = RUG.w - 2 * bs, d = RUG.d - 2 * bs;
  const s = new THREE.Shape();
  const x0 = -w / 2, x1 = w / 2, y0 = -d / 2, y1 = d / 2;
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: 3, curveSegments: 6 });
  geo.rotateX(-Math.PI / 2).translate(RUG.cx, bt + 0.0005, RUG.cz);
  // UV 0..1 across the rug (the pattern is painted for the whole rug)
  const p = geo.attributes.position.array, n = geo.attributes.position.count, uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    uv[i * 2] = (p[i * 3] - (RUG.cx - RUG.w / 2)) / RUG.w;
    uv[i * 2 + 1] = 1 - (p[i * 3 + 2] - (RUG.cz - RUG.d / 2)) / RUG.d;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return mesh(geo, rugMaterial(), { cast: false, name: 'Hand-tufted wool rug' });
}

// ===========================================================================
// Decor
// ===========================================================================
function leafGeometry(L, W, fold = 0.22) {
  const f = W * fold;
  const pos = [0, 0, 0, W / 2, L * 0.36, f, W * 0.28, L * 0.74, f * 0.6, 0, L, 0, -W * 0.28, L * 0.74, f * 0.6, -W / 2, L * 0.36, f, 0, L * 0.5, -f * 0.15];
  const idx = [0, 1, 6, 6, 1, 2, 6, 2, 3, 0, 6, 5, 6, 4, 5, 6, 3, 4];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Leaves scattered along twigs (curves), instanced.
function scatterLeaves(twigs, { geo, mat, perMetre, from = 0.2, scale = [0.8, 1.2], colours, seed, keep = () => true, spread = 0.012, upBias = 0.3, out = 0.9 }) {
  const r = rng(seed), mats = [], cols = [];
  const p = V(0, 0, 0), t = V(0, 0, 0), side = V(0, 0, 0), dir = V(0, 0, 0), nrm = V(0, 0, 0), xa = V(0, 0, 0), up = V(0, 1, 0);
  const m4 = new THREE.Matrix4(), sc = V(1, 1, 1), q = new THREE.Quaternion(), c = new THREE.Color();
  for (const tw of twigs) {
    const n = Math.round(tw.getLength() * perMetre);
    for (let i = 0; i < n; i++) {
      const u = from + (1 - from) * r();
      tw.getPointAt(u, p); tw.getTangentAt(u, t);
      side.set(r() - 0.5, r() - 0.5, r() - 0.5).cross(t).normalize();
      dir.copy(t).multiplyScalar(0.45 + (u > 0.96 ? 0.8 : 0)).addScaledVector(side, out).addScaledVector(up, upBias).normalize();
      nrm.copy(up).addScaledVector(side, 0.6).add(V(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.6));
      nrm.addScaledVector(dir, -nrm.dot(dir)).normalize();
      xa.crossVectors(dir, nrm).normalize();
      m4.makeBasis(xa, dir, nrm);
      q.setFromRotationMatrix(m4);
      const s = lerp(scale[0], scale[1], r());
      sc.set(s, s, s);
      p.addScaledVector(side, spread * r());
      if (!keep(p)) continue;
      mats.push(new THREE.Matrix4().compose(p.clone(), q.clone(), sc.clone()));
      const pick = colours[Math.floor(r() * colours.length)];
      c.set(pick).offsetHSL(0, 0, (r() - 0.5) * 0.06);
      cols.push(c.clone());
    }
  }
  const im = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, cols[i]); });
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = true; im.receiveShadow = true;
  return im;
}

function vaseGeometry(H = 0.25, belly = 0.082) {
  // stoneware bottle vase with an opening
  return lathe([
    [0, 0], [belly * 0.62, 0], [belly * 0.78, 0.006], [belly * 0.95, H * 0.16], [belly, H * 0.32], [belly * 0.9, H * 0.52],
    [belly * 0.55, H * 0.72], [belly * 0.36, H * 0.84], [belly * 0.33, H * 0.96], [belly * 0.36, H], [belly * 0.27, H * 0.995], [belly * 0.25, H * 0.9], [belly * 0.2, H * 0.8],
  ], 40);
}

function buildFloorLamp(oak) {
  const g = new THREE.Group(); g.name = 'Tripod floor lamp';
  const black = new THREE.MeshStandardMaterial({ color: '#1f1f20', roughness: 0.5, metalness: 0.4 });
  const brass = new THREE.MeshStandardMaterial({ color: '#b8965c', roughness: 0.32, metalness: 0.9 });
  const hubY = 1.27, shadeY0 = 1.31, shadeH = 0.32, shadeR = 0.24;
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + k * TAU / 3;
    const foot = V(0.3 * Math.cos(a), 0.004, 0.3 * Math.sin(a)), top = V(0.028 * Math.cos(a), hubY, 0.028 * Math.sin(a));
    g.add(strut(foot, top, 0.0105, 0.015, oak));
    const pad = mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.006, 12), black); pad.position.set(foot.x, 0.003, foot.z); g.add(pad);
  }
  const hub = mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.055, 20), brass); hub.position.y = hubY + 0.005; g.add(hub);
  g.add(strut(V(0, hubY + 0.03, 0), V(0, 1.43, 0), 0.0065, 0.0065, black, 10));
  const socket = mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.05, 16), black); socket.position.y = 1.45; g.add(socket);
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.35, 1.0) });
  const bulb = mesh(new THREE.SphereGeometry(0.03, 16, 12), bulbMat, { cast: false }); bulb.position.y = 1.5; g.add(bulb);
  // drum shade: linen outside, glowing inside, opal diffuser at the bottom
  const lin = linenTex();
  const shadeOut = new THREE.MeshStandardMaterial({ color: '#efe6d6', map: lin, roughness: 1, emissive: '#ffcf96', emissiveMap: lin, emissiveIntensity: 0.42 });
  const shadeIn = new THREE.MeshStandardMaterial({ color: '#fff3df', roughness: 1, emissive: '#ffd49a', emissiveIntensity: 1.05, side: THREE.BackSide });
  const sg = new THREE.CylinderGeometry(shadeR, shadeR, shadeH, 64, 1, true).translate(0, shadeY0 + shadeH / 2, 0);
  const so = mesh(sg, shadeOut, { name: 'Linen drum shade' }); g.add(so);
  const si = mesh(sg, shadeIn, { cast: false }); g.add(si);
  const diff = mesh(new THREE.CircleGeometry(shadeR - 0.004, 48).rotateX(Math.PI / 2).translate(0, shadeY0 + 0.012, 0),
    new THREE.MeshStandardMaterial({ color: '#fbf6ee', emissive: '#ffe2b8', emissiveIntensity: 0.9, roughness: 1, side: THREE.DoubleSide }), { cast: false });
  g.add(diff);
  for (const y of [shadeY0 + 0.002, shadeY0 + shadeH - 0.002]) {
    const ring = mesh(new THREE.TorusGeometry(shadeR + 0.0015, 0.0028, 6, 64).rotateX(Math.PI / 2), brass, { cast: false });
    ring.position.y = y; g.add(ring);
  }
  for (let k = 0; k < 3; k++) {   // spider
    const a = k * TAU / 3 + 0.5;
    g.add(strut(V(0, 1.475, 0), V((shadeR - 0.002) * Math.cos(a), shadeY0 + shadeH - 0.004, (shadeR - 0.002) * Math.sin(a)), 0.0022, 0.0022, brass, 6));
  }
  // cable: down the back leg and along the floor to the skirting
  const legTop = V(0, hubY, -0.028), legFoot = V(0, 0.004, -0.3), cp = [V(0.006, hubY - 0.005, -0.03)];
  for (const t of [0.04, 0.3, 0.6, 0.9, 0.975]) cp.push(legTop.clone().lerp(legFoot, t).add(V(lerp(0.0178, 0.0133, t), 0, 0)));
  cp.push(V(0.022, 0.0028, -0.33), V(0.06, 0.0028, -0.4), V(0.11, 0.0028, -0.46), V(0.13, 0.0028, -0.5 + SKIRT.t + 0.003));
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cp), 60, 0.0026, 6, false), black, { cast: false, name: 'Fabric cable' }));
  const light = new THREE.PointLight('#ffc98c', 0.75, 7, 2);
  light.position.set(0, 1.47, 0);
  light.castShadow = false;
  light.name = 'Floor lamp bulb';
  g.add(light);
  return { group: g, light, shadeOut, shadeIn, bulbMat, diffMat: diff.material };
}

function buildSideTable(oak) {
  const g = new THREE.Group(); g.name = 'Oak side table';
  const R = 0.22, H = 0.52, T = 0.03;
  g.add(mesh(worldUV(lathe(discProfile(R, T, 0.011), 64).translate(0, H - T, 0), 1.0), oak));
  for (let k = 0; k < 3; k++) {
    const a = Math.PI / 2 + k * TAU / 3;
    g.add(strut(V(0.17 * Math.cos(a), 0, 0.17 * Math.sin(a)), V(0.125 * Math.cos(a), H - T + 0.002, 0.125 * Math.sin(a)), 0.011, 0.017, oak));
  }
  // stoneware vase + dried beech branches
  const vase = mesh(vaseGeometry(0.25, 0.082), M.ceramic, { name: 'Stoneware vase' });
  vase.position.set(-0.03, H, -0.02);
  g.add(vase);
  const r = rng(733), twigMat = new THREE.MeshStandardMaterial({ color: '#7a6450', roughness: 0.9 });
  const base = V(-0.03, H + 0.21, -0.02), stems = [], geos = [];
  const tips = [[-0.24, 0.62, 0.06], [-0.1, 0.72, -0.05], [0.07, 0.6, 0.1], [-0.2, 0.5, 0.16], [0.02, 0.48, -0.1]];
  for (const [dx, dy, dz] of tips) {
    const a = base.clone().add(V((r() - 0.5) * 0.02, -0.05, (r() - 0.5) * 0.02));
    const tip = base.clone().add(V(dx, dy, dz));
    const mid = a.clone().lerp(tip, 0.5).add(V(dx * 0.15, 0.04, dz * 0.1));
    const c = new THREE.CatmullRomCurve3([a, mid, tip]);
    geos.push(taperTube(c, 0.0042, 0.0012, 18, 5)); stems.push(c);
    for (let k = 0; k < 3; k++) {   // side twigs
      const u = 0.45 + r() * 0.4, p0 = c.getPointAt(u), tdir = c.getTangentAt(u);
      const d = V(r() - 0.5, 0.35 + r() * 0.3, r() - 0.5).normalize().add(tdir).normalize();
      const p1 = p0.clone().addScaledVector(d, 0.07 + r() * 0.08);
      const tc = new THREE.CatmullRomCurve3([p0, p0.clone().lerp(p1, 0.5).add(V(0, 0.01, 0)), p1]);
      geos.push(taperTube(tc, 0.0018, 0.0008, 8, 4)); stems.push(tc);
    }
  }
  g.add(mesh(mergeGeometries(geos), twigMat, { name: 'Dried branches' }));
  const leafMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, side: THREE.DoubleSide });
  g.add(scatterLeaves(stems, {
    geo: leafGeometry(0.046, 0.026, 0.3), mat: leafMat, perMetre: 46, from: 0.35, scale: [0.7, 1.15], seed: 739,
    colours: ['#b39570', '#a88b69', '#c2a582', '#9a7f62', '#bfa98c'], spread: 0.006, upBias: 0.1, out: 1.0,
  }));
  return g;
}

function buildOlive() {
  const g = new THREE.Group(); g.name = 'Olive tree';
  const potMat = new THREE.MeshStandardMaterial({ color: '#d4ccbf', roughness: 0.88 });
  const pot = lathe([[0, 0], [0.17, 0], [0.19, 0.012], [0.222, 0.1], [0.24, 0.24], [0.238, 0.38], [0.232, 0.455], [0.236, 0.462], [0.236, 0.468], [0.222, 0.468], [0.218, 0.44], [0.21, 0.36]], 56);
  g.add(mesh(pot, potMat, { name: 'Stoneware planter' }));
  const soilMat = new THREE.MeshStandardMaterial({ color: '#4a3c30', roughness: 1 });
  g.add(mesh(new THREE.CircleGeometry(0.214, 40).rotateX(-Math.PI / 2).translate(0, 0.43, 0), soilMat, { cast: false }));
  const r = rng(907), pebMat = new THREE.MeshStandardMaterial({ color: '#cfcac1', roughness: 0.7 });
  const pebGeo = new THREE.SphereGeometry(1, 10, 6);
  for (let i = 0; i < 26; i++) {
    const a = r() * TAU, d = 0.06 + r() * 0.14, s = 0.012 + r() * 0.012;
    const p = mesh(pebGeo, pebMat, { cast: false }); p.scale.set(s, s * 0.55, s * 0.8); p.position.set(Math.cos(a) * d, 0.432, Math.sin(a) * d); p.rotation.y = r() * TAU; g.add(p);
  }
  const bark = new THREE.MeshStandardMaterial({ color: '#6c6052', roughness: 0.95 });
  const geos = [], leafy = [];
  // twin stems twisting round each other, as nursery olives are trained
  const t1 = new THREE.CatmullRomCurve3([V(0.0, 0.4, 0.0), V(0.035, 0.6, -0.01), V(-0.015, 0.82, 0.03), V(0.02, 1.04, 0.04), V(0.0, 1.16, 0.05)]);
  const t2 = new THREE.CatmullRomCurve3([V(0.03, 0.4, 0.02), V(-0.02, 0.6, 0.03), V(0.03, 0.8, 0.0), V(-0.01, 1.0, 0.02), V(-0.04, 1.1, 0.0)]);
  geos.push(taperTube(t1, 0.03, 0.016, 22, 9), taperTube(t2, 0.022, 0.012, 22, 8));
  // canopy stays off the walls (local x 0.6 / z −0.5) and above the side table
  const lim = (p) => { p.x = clamp(p.x, -0.5, 0.47); p.z = clamp(p.z, -0.36, 0.55); p.y = Math.min(p.y, 2.1); return p; };
  const branch = (p0, dir, len, r0, r1, droop, segs, radial) => {
    const p2 = lim(p0.clone().addScaledVector(dir, len).add(V(0, -droop, 0)));
    const p1 = p0.clone().lerp(p2, 0.5).add(V(0, droop * 0.7 + len * 0.05, 0));
    const c = new THREE.CatmullRomCurve3([p0, p1, p2]);
    geos.push(taperTube(c, r0, r1, segs, radial));
    return c;
  };
  const heads = [V(0.0, 1.16, 0.05), V(-0.04, 1.1, 0.0)];
  for (let b = 0; b < 6; b++) {
    const a = (b / 6) * TAU + r() * 0.4, out = V(Math.cos(a), 0, Math.sin(a));
    const s0 = heads[b % 2].clone().add(V((r() - 0.5) * 0.02, -r() * 0.05, (r() - 0.5) * 0.02));
    const dir = V(out.x * (0.5 + 0.2 * r()), 0.85 + 0.3 * r(), out.z * 0.5 + 0.1).normalize();
    const main = branch(s0, dir, 0.6 + r() * 0.28, 0.013, 0.0035, 0.05, 18, 6);
    leafy.push([main, 0.62]);
    for (let k = 0; k < 4; k++) {
      const u = 0.3 + 0.17 * k + r() * 0.08, p0 = main.getPointAt(u), td = main.getTangentAt(u);
      const d = td.multiplyScalar(0.55).addScaledVector(out, 0.55).add(V(r() - 0.5, 0.25 * r(), r() - 0.5).multiplyScalar(0.7)).normalize();
      const sec = branch(p0, d, 0.18 + r() * 0.14, 0.0055, 0.0017, 0.06, 10, 5);
      leafy.push([sec, 0.1]);
      for (let m = 0; m < 2; m++) {
        const u2 = 0.35 + r() * 0.5, q0 = sec.getPointAt(u2);
        const d2 = sec.getTangentAt(u2).add(V(r() - 0.5, 0.2, r() - 0.5).multiplyScalar(1.1)).normalize();
        leafy.push([branch(q0, d2, 0.08 + r() * 0.07, 0.0022, 0.0009, 0.03, 6, 4), 0.05]);
      }
    }
  }
  g.add(mesh(mergeGeometries(geos), bark, { name: 'Olive trunk' }));
  // leaves: opposite pairs angled toward the twig tip, blades turned to the light,
  // tips drooping; silvery grey-green with paler undersides mixed in
  const leafGeo = leafGeometry(0.07, 0.016, 0.22), leafMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, side: THREE.DoubleSide });
  const pal = ['#7d8a6c', '#919d82', '#a5ae98', '#88957a', '#b3baa7', '#74826a'];
  const lm = [], lc = [], p = V(0, 0, 0), t = V(0, 0, 0), side = V(0, 0, 0), dir = V(0, 0, 0), nrm = V(0, 0, 0), xa = V(0, 0, 0), up = V(0, 1, 0);
  const basis = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  const push = (pos, d, sc) => {
    nrm.copy(up).add(V(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.9));
    nrm.addScaledVector(d, -nrm.dot(d)).normalize();
    xa.crossVectors(d, nrm).normalize();
    q.setFromRotationMatrix(basis.makeBasis(xa, d, nrm));
    lm.push(new THREE.Matrix4().compose(pos.clone(), q.clone(), V(sc, sc, sc)));
    lc.push(col.set(pal[Math.floor(r() * pal.length)]).offsetHSL(0, 0, (r() - 0.5) * 0.05).clone());
  };
  for (const [c, from] of leafy) {
    const n = Math.max(2, Math.floor((c.getLength() * (1 - from)) / 0.021));
    for (let i = 0; i <= n; i++) {
      const u = from + (1 - from) * (i / n) * 0.97;
      c.getPointAt(u, p); c.getTangentAt(u, t);
      side.crossVectors(t, up); if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
      side.normalize().applyAxisAngle(t, (i % 2 ? 0.45 : -0.45) + (r() - 0.5) * 0.5);
      for (const sg of [1, -1]) {
        const ang = degToRad(36 + r() * 20);
        dir.copy(t).multiplyScalar(Math.cos(ang)).addScaledVector(side, sg * Math.sin(ang));
        dir.y -= 0.1 + r() * 0.15;
        push(p, dir.normalize(), 0.78 + r() * 0.4);
      }
    }
    c.getPointAt(1, p); c.getTangentAt(1, t);
    push(p, t.clone().add(V(0, -0.15, 0)).normalize(), 0.7);
  }
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, lm.length);
  lm.forEach((m, i) => { leaves.setMatrixAt(i, m); leaves.setColorAt(i, lc[i]); });
  leaves.castShadow = leaves.receiveShadow = true;
  leaves.name = 'Olive leaves';
  g.add(leaves);
  g.userData.leafCount = lm.length;
  return g;
}

function buildPrints(oak) {
  const g = new THREE.Group(); g.name = 'Framed prints';
  const H = 0.55, yc = 1.675, f = 0.02, depth = 0.026, gap = 0.1;
  const specs = [['arch', 0.44, 11], ['dunes', 0.72, 13], ['leaf', 0.44, 17]];
  const total = specs.reduce((s, q) => s + q[1], 0) + gap * (specs.length - 1);
  let x = 0.4 - total / 2;
  const glass = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.07, roughness: 0.03, metalness: 0, depthWrite: false });
  for (const [kind, W, seed] of specs) {
    const cx = x + W / 2; x += W + gap;
    const s = new THREE.Shape();
    s.moveTo(-W / 2, -H / 2); s.lineTo(W / 2, -H / 2); s.lineTo(W / 2, H / 2); s.lineTo(-W / 2, H / 2); s.closePath();
    const h = new THREE.Path();
    h.moveTo(-W / 2 + f, -H / 2 + f); h.lineTo(-W / 2 + f, H / 2 - f); h.lineTo(W / 2 - f, H / 2 - f); h.lineTo(W / 2 - f, -H / 2 + f); h.closePath();
    s.holes.push(h);
    const fg = new THREE.ExtrudeGeometry(s, { depth: depth - 0.003, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 1, curveSegments: 2 });
    fg.translate(cx, yc, ROOM.z0 + 0.004);
    g.add(mesh(worldUV(fg, 1.0), oak, { name: 'Oak frame' }));
    const iw = W - 2 * f, ih = H - 2 * f, px = 900;
    const cw = Math.round(iw * px), ch = Math.round(ih * px), matPx = Math.round(0.058 * px);
    const art = new THREE.MeshStandardMaterial({ map: tex(artCanvas(kind, cw, ch, matPx, seed), { wrap: false }), roughness: 0.85 });
    g.add(mesh(new THREE.PlaneGeometry(iw, ih).translate(cx, yc, ROOM.z0 + 0.009), art, { cast: false, name: 'Art print' }));
    g.add(mesh(new THREE.PlaneGeometry(iw, ih).translate(cx, yc, ROOM.z0 + depth - 0.002), glass, { cast: false, receive: false }));
  }
  renderIf(g, inRoomZ0, { cast: true });
  return g;
}

function book(w, t, d, cover, pages, r) {
  const g = new THREE.Group(), c = 0.0022;
  const coverG = new RoundedBoxGeometry(w, c, d, 1, 0.0008);
  g.add(mesh(coverG, cover).translateY(c / 2));
  g.add(mesh(coverG, cover).translateY(t - c / 2));
  g.add(mesh(new RoundedBoxGeometry(c * 1.4, t, d, 1, 0.001), cover).translateX(-w / 2 + c * 0.7).translateY(t / 2));
  const pg = mesh(new THREE.BoxGeometry(w - 0.006, t - 2 * c, d - 0.006), pages);
  pg.position.set(-0.002, t / 2, 0);
  g.add(pg);
  g.rotation.y = r;
  return g;
}

function buildCoffeeTable(oak) {
  const g = new THREE.Group(); g.name = 'Round oak coffee table';
  const R = 0.42, H = 0.38, T = 0.04;
  g.add(mesh(worldUV(lathe(discProfile(R, T, 0.013), 72).translate(0, H - T, 0), 1.0), oak));
  g.add(mesh(worldUV(lathe([[0.3, H - T - 0.055], [0.316, H - T - 0.055], [0.316, H - T], [0.3, H - T], [0.3, H - T - 0.055]], 56), 1.0), oak));
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    g.add(strut(V(0.29 * Math.cos(a), 0, 0.29 * Math.sin(a)), V(0.3 * Math.cos(a), H - T, 0.3 * Math.sin(a)), 0.022, 0.03, oak, 18));
  }
  // styling on top
  const pages = new THREE.MeshStandardMaterial({ color: '#efe8da', roughness: 0.95 });
  const covers = [['#9aa38b', 0.27, 0.03, 0.33, -0.12], ['#d8c8ac', 0.235, 0.026, 0.29, 0.07], ['#4c4e4d', 0.2, 0.021, 0.25, -0.22]];
  let y = H;
  for (const [hex, w, t, d, rot] of covers) {
    const b = book(w, t, d, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8 }), pages, rot);
    b.position.set(-0.13, y, 0.06); y += t; g.add(b);
  }
  // small ceramic dish + pillar candle
  const dish = mesh(lathe([[0, 0], [0.06, 0], [0.072, 0.008], [0.074, 0.013], [0.068, 0.013], [0.058, 0.006], [0, 0.006]], 40), M.ceramic);
  dish.position.set(0.17, H, -0.15); g.add(dish);
  const wax = new THREE.MeshStandardMaterial({ color: '#f3ece0', roughness: 0.55, emissive: '#ffd9a8', emissiveIntensity: 0.06 });
  const candle = mesh(lathe([[0, 0], [0.036, 0], [0.037, 0.004], [0.037, 0.1], [0.033, 0.104], [0.028, 0.099], [0, 0.097]], 32), wax, { name: 'Pillar candle' });
  candle.position.set(0.17, H + 0.006, -0.15); g.add(candle);
  const wick = mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.014, 6), new THREE.MeshStandardMaterial({ color: '#1a1714' }), { cast: false });
  wick.position.set(0.17, H + 0.006 + 0.104, -0.15); g.add(wick);
  const flame = mesh(lathe([[0, 0], [0.004, 0.004], [0.0052, 0.011], [0.0035, 0.02], [0, 0.03]], 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.45, 0.6) }), { cast: false, receive: false, name: 'Candle flame' });
  flame.position.set(0.17, H + 0.006 + 0.109, -0.15); g.add(flame);
  // little stoneware bowl
  const bowl = mesh(lathe([[0, 0], [0.04, 0], [0.05, 0.004], [0.072, 0.03], [0.084, 0.055], [0.08, 0.056], [0.068, 0.034], [0.044, 0.012], [0, 0.01]], 40), M.ceramic, { name: 'Stoneware bowl' });
  bowl.position.set(0.15, H, 0.19); g.add(bowl);
  return g;
}

function buildPouf() {
  const { tone, normal } = knitTextures();
  const t1 = tone.clone(), n1 = normal.clone();
  t1.repeat.set(14, 4); n1.repeat.set(14, 4);
  const mat = new THREE.MeshStandardMaterial({ color: '#e6dccb', map: t1, normalMap: n1, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 1 });
  const pts = [[0, 0], [0.2, 0], [0.235, 0.012], [0.252, 0.05], [0.258, 0.2], [0.25, 0.33], [0.23, 0.37], [0.19, 0.392], [0.1, 0.402], [0, 0.404]];
  const geo = lathe(pts, 64);
  const g = new THREE.Group(); g.name = 'Knitted pouf';
  g.add(mesh(geo, mat, { name: 'Chunky knit pouf' }));
  return g;
}

// ===========================================================================
// Pillows + throw (baked in world space against the sofa's nominal surfaces)
// ===========================================================================
function pillowGeometry(w, h, t, seed = 1) {
  const n = 26, N = n + 1, hw = w / 2, hh = h / 2, pinch = 0.075;
  const nz = makeNoise(seed, 8);
  const P = (a, b) => [a * hw * (1 - pinch * (1 - b * b)), b * hh * (1 - pinch * (1 - a * a))];
  const pos = new Float32Array(N * N * 2 * 3), uv = new Float32Array(N * N * 2 * 2), idx = [];
  let k = 0;
  for (let s = 0; s < 2; s++) {
    const side = s ? -1 : 1;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a0 = -1 + 2 * i / n, b0 = -1 + 2 * j / n;
      const a = Math.sign(a0) * Math.pow(Math.abs(a0), 0.8), b = Math.sign(b0) * Math.pow(Math.abs(b0), 0.8);
      const [x, y] = P(a, b);
      const f = Math.max(0, (1 - Math.pow(Math.abs(a), 2.4)) * (1 - Math.pow(Math.abs(b), 2.4)));
      // domed (not flat-topped) crown + soft creases running in from the corners
      const crease = 0.045 * Math.exp(-((Math.abs(a) - Math.abs(b)) ** 2) / 0.02) * sstep(0.35, 0.9, Math.max(Math.abs(a), Math.abs(b)));
      const z = (t / 2) * Math.pow(f, 0.58) * (1 - crease) * (1 + 0.07 * (nz(a * 2.5 + 3 + s * 4, b * 2.5 + 3) - 0.5));
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = side * z;
      uv[k * 2] = x / 0.1; uv[k * 2 + 1] = y / 0.1;
      k++;
    }
  }
  for (let s = 0; s < 2; s++) {
    const o = s * N * N;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = o + j * N + i, b = a + 1, c = a + N, d = c + 1;
      if (s) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  body.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  body.setIndex(idx);
  const loop = [], m = 24;
  for (let i = 0; i < 4 * m; i++) {
    const q = Math.floor(i / m), t2 = (i % m) / m * 2 - 1;
    const [a, b] = [[t2, -1], [1, t2], [-t2, 1], [-1, -t2]][q];
    const [x, y] = P(a, b);
    loop.push(V(x, y, 0));
  }
  const pipe = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(loop, true, 'centripetal'), 4 * m * 2, 0.0055, 6, true);
  return { body, pipe };
}

// Lean a pillow (tilted back, yawed) into the angle between a seat (top seatY) and a
// back cushion (front face backZ at seat level, leaning back `lean`), then squash
// the contact patches flat so it reads as resting with a little weight.
function placePillow(parts, { x, yaw = 0, tilt = 0, roll = 0, seatY, backZ, lean, crown = 0.012, sink = 0.007, minX = -Infinity }) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-tilt, yaw, roll, 'YXZ'));
  const tl = Math.tan(lean), zb = (y) => backZ + crown - (y - seatY) * tl;
  parts.body.applyQuaternion(q); parts.pipe.applyQuaternion(q);
  const a = parts.body.attributes.position.array;
  let minY = Infinity;
  for (let i = 1; i < a.length; i += 3) minY = Math.min(minY, a[i]);
  const py = seatY - sink - minY;
  let mz = Infinity, mx = Infinity;
  for (let i = 0; i < a.length; i += 3) { mz = Math.min(mz, a[i + 2] - zb(a[i + 1] + py)); mx = Math.min(mx, a[i]); }
  const pz = -sink - mz, px = Math.max(x, minX + 0.004 - mx);
  for (const g of [parts.body, parts.pipe]) {
    g.translate(px, py, pz);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const Y = Math.max(p.getY(i), seatY + 0.0015);
      p.setXYZ(i, Math.max(p.getX(i), minX + 0.002), Y, Math.max(p.getZ(i), zb(Y) + 0.0015));
    }
    g.computeVertexNormals();
  }
  return parts;
}

// Folded knitted throw draped over the chaise's arm bolster (arm runs along z).
function throwGeometry(arm, { zA, zB, T = 0.022, clear = 0.006, inBot, outBot, seed = 9 }) {
  const c = clear + T / 2, r = arm.r, path = [];
  const add = (x, y, nx, ny, side) => path.push({ x, y, nx, ny, side });
  const nIn = 8, nOut = 14;
  for (let i = 0; i <= nIn; i++) add(arm.x1 + c, lerp(inBot, arm.top - r, i / nIn), 1, 0, 1);
  for (let i = 1; i <= 10; i++) { const t = (i / 10) * Math.PI / 2; add(arm.x1 - r + (r + c) * Math.cos(t), arm.top - r + (r + c) * Math.sin(t), Math.cos(t), Math.sin(t), 0); }
  const xa = arm.x1 - r, xb = arm.x0 + r;
  for (let i = 1; i <= 3; i++) add(lerp(xa, xb, i / 3), arm.top + c, 0, 1, 0);
  for (let i = 1; i <= 10; i++) { const t = Math.PI / 2 + (i / 10) * Math.PI / 2; add(xb + (r + c) * Math.cos(t), arm.top - r + (r + c) * Math.sin(t), Math.cos(t), Math.sin(t), 0); }
  for (let i = 1; i <= nOut; i++) add(arm.x0 - c, lerp(arm.top - r, outBot, i / nOut), -1, 0, -1);
  const S = [0];
  for (let i = 1; i < path.length; i++) S.push(S[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  const L = S[S.length - 1], NZ = 40, NS = path.length, nz = makeNoise(seed, 16);
  const pos = new Float32Array(NS * (NZ + 1) * 2 * 3), uv = new Float32Array(NS * (NZ + 1) * 2 * 2), idx = [];
  const bottom = [];
  let k = 0;
  for (let s = 0; s < 2; s++) {
    const side = s ? -1 : 1;
    for (let j = 0; j <= NZ; j++) {
      const z = lerp(zA, zB, j / NZ);
      for (let i = 0; i < NS; i++) {
        const P = path[i];
        const hang = P.side ? Math.max(0, arm.top - r - P.y) : 0;
        const amp = P.side > 0 ? 0.008 : 0.016;
        const lam = 0.12 + 0.03 * nz(z * 8, 1);
        const fold = amp * sstep(0, 0.2, hang) * (0.5 + 0.5 * Math.sin(((z - zA) / lam) * TAU + nz(z * 4, P.side * 3) * 2));
        const flare = P.side < 0 ? 0.016 * (hang / 0.3) ** 2 : 0.004 * (hang / 0.1) ** 2;
        const ez = Math.min(z - zA, zB - z), curl = P.side ? 0.008 * sstep(0.05, 0, ez) * sstep(0.03, 0.15, hang) : 0;
        const disp = fold + flare + curl + 0.0015 * nz(S[i] * 30, z * 30);
        const e = Math.min(S[i], L - S[i], ez);
        const fall = Math.sqrt(clamp(e / (T * 0.75), 0, 1));
        const off = disp + side * (T / 2) * fall;
        pos[k * 3] = P.x + P.nx * off; pos[k * 3 + 1] = P.y + P.ny * off; pos[k * 3 + 2] = z;
        uv[k * 2] = S[i] / 0.09; uv[k * 2 + 1] = z / 0.09;
        if (s === 0 && i === NS - 1) bottom.push(V(P.x + P.nx * disp, P.y, z));
        k++;
      }
    }
  }
  for (let s = 0; s < 2; s++) {
    const o = s * NS * (NZ + 1);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NS - 1; i++) {
      const a = o + j * NS + i, b = a + 1, c2 = a + NS, d = c2 + 1;
      if (s) idx.push(a, c2, b, b, c2, d); else idx.push(a, b, c2, b, d, c2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // knotted fringe along the hanging outer edge
  const fr = [], rr = rng(seed + 1);
  const tg = new THREE.CylinderGeometry(0.0026, 0.0018, 1, 5, 1);
  for (let i = 1; i < bottom.length - 1; i += 1) {
    const b = bottom[i];
    const len = 0.04 + rr() * 0.012;
    const a0 = b.clone().add(V(-0.002, 0.006, 0)), a1 = a0.clone().add(V(-0.004 - rr() * 0.006, -len, (rr() - 0.5) * 0.008));
    const g = tg.clone(), d = a1.clone().sub(a0);
    g.scale(1, d.length(), 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_Y, d.clone().normalize()));
    g.translate((a0.x + a1.x) / 2, (a0.y + a1.y) / 2, (a0.z + a1.z) / 2);
    fr.push(g);
  }
  return { body: geo, fringe: mergeGeometries(fr) };
}

function buildPillows(halfW) {
  const g = new THREE.Group(); g.name = 'pillows';
  const seatY = DIM.seatH, backZ = DIM.backCushFrontZ, lean = DIM.backLean;
  const armX0 = -halfW, armX1 = -halfW + 0.17 * DIM.W.chaise / 1.02;
  const add = (parts, mat, label) => {
    g.add(mesh(parts.body, mat, { name: label }));
    g.add(mesh(parts.pipe, mat, { cast: false }));
  };
  // two accent cushions nestled into the chaise's back corner
  add(placePillow(pillowGeometry(0.47, 0.47, 0.19, 3), { x: armX1 + 0.255, yaw: degToRad(17), tilt: degToRad(15), roll: degToRad(-2), seatY, backZ, lean, minX: armX1 }), M.accent, 'Linen accent cushion');
  add(placePillow(pillowGeometry(0.43, 0.43, 0.175, 5), { x: armX1 + 0.69, yaw: degToRad(-5), tilt: degToRad(13), roll: degToRad(3), seatY, backZ, lean }), M.accent, 'Linen accent cushion');
  // a bouclé cushion on the single seat
  const bx = -halfW + DIM.W.chaise + DIM.W.bedseat * 0.45;
  add(placePillow(pillowGeometry(0.45, 0.45, 0.18, 7), { x: bx, yaw: degToRad(-7), tilt: degToRad(15), roll: degToRad(-2.5), seatY, backZ, lean }), M.throw, 'Bouclé cushion');
  // knitted throw folded over the chaise arm
  const arm = { x0: armX0, x1: armX1, top: DIM.armH - 0.02 + 0.012, r: 0.06 };
  const th = throwGeometry(arm, { zA: 0.6, zB: 1.08, inBot: seatY + 0.055, outBot: 0.27 });
  g.add(mesh(th.body, M.throw, { name: 'Knitted throw' }));
  g.add(mesh(th.fringe, M.throw, { cast: false, name: 'Throw fringe' }));
  return g;
}

// ===========================================================================
// createRoom
// ===========================================================================
export function createRoom({ sofaWidth = 3.72, sofaDepth = 1.72, plan = null } = {}) {
  const halfW = sofaWidth / 2;
  if (plan) {
    Object.assign(ROOM, plan.room);
    Object.assign(WIN, plan.window, { frameX: plan.room.x0 - 0.2 });
    Object.assign(RUG, plan.rug);
    Object.assign(PLAN, { east: plan.east, tvWallEnd: plan.tvWallEnd, corridor: plan.corridor ?? 1.2 });
  }
  const group = new THREE.Group(); group.name = 'room';
  const params = { decor: 1, pillows: 1 };
  const state = { floor: 'stone', wall: WALL_COLOURS[0].hex };

  const wallMat = new THREE.MeshStandardMaterial({ color: state.wall, map: plasterTex(), roughness: 0.94 });
  const skirtMat = new THREE.MeshStandardMaterial({ color: state.wall, roughness: 0.48 });
  const oak = new THREE.MeshStandardMaterial({ map: oakGrainTex(), roughness: 0.55 });

  const shell = buildShell(wallMat, skirtMat, oak);
  group.add(shell.group);
  const floorMats = {};
  const floorMaterial = (k) => floorMats[k] || (floorMats[k] = k === 'oak' ? oakFloorMaterial() : stoneFloorMaterial());
  for (const f of shell.floors) f.material = floorMaterial(state.floor);
  group.add(buildRug());

  // ---- decor ----
  const decor = new THREE.Group(); decor.name = 'decor';
  group.add(decor);
  const lamp = buildFloorLamp(oak);
  lamp.group.position.set(-halfW - 0.49, 0, 0.35);
  if (plan) lamp.group.position.set(ROOM.x0 + 0.36, 0, ROOM.z1 - 0.36);   // window corner: reading light for the chaise
  decor.add(lamp.group);
  const side = buildSideTable(oak);
  side.position.set(halfW + 0.39, 0, 0.45);
  if (plan) side.position.set(halfW + 0.27, 0, ROOM.z0 + 0.4);
  decor.add(side);
  const olive = buildOlive();
  olive.position.set(3.0, 0, 0.35);
  if (plan) olive.position.set(ROOM.x1 - 0.38, 0, ROOM.z0 + 0.3);        // dead nook beside the closet, off the walkway
  decor.add(olive);
  decor.add(buildPrints(oak));
  const table = buildCoffeeTable(oak);
  table.position.set(0.55, RUG.top, 2.6);
  if (plan) { table.position.set(plan.coffee.x, RUG.top, plan.coffee.z); table.scale.set(plan.coffee.d / 0.84, 1, plan.coffee.d / 0.84); }
  decor.add(table);
  const pouf = buildPouf();
  pouf.position.set(-0.42, RUG.top, 2.55);
  if (!plan) decor.add(pouf);              // keeps the walkway in front of the TV clear in the real room

  // ---- cushions + throw ----
  const pillows = buildPillows(halfW);
  group.add(pillows);

  // The lamp glow and the view outside follow the lamp's intensity: the app scales
  // room lights ×4 for its evening mood, so the shade brightens and dusk falls.
  const L0 = lamp.light.intensity;
  const dayExt = new THREE.Color(1.12, 1.12, 1.12), duskExt = new THREE.Color(0.075, 0.095, 0.15);
  const glow = (o, base) => { const m = o.material; o.onBeforeRender = () => { const k = clamp(lamp.light.intensity / L0, 0, 6); m.emissiveIntensity = base * (0.7 + 0.3 * k); }; };
  lamp.group.traverse((o) => {
    if (o.isMesh && o.material === lamp.shadeOut) glow(o, lamp.shadeOut.emissiveIntensity);
    if (o.isMesh && o.material === lamp.shadeIn) glow(o, lamp.shadeIn.emissiveIntensity);
    if (o.isMesh && o.material === lamp.diffMat) glow(o, lamp.diffMat.emissiveIntensity);
  });
  const extMat = shell.ext.material;
  shell.ext.onBeforeRender = function (r, s, cam, g, mat) {
    const k = clamp(lamp.light.intensity / L0, 1, 4), night = (k - 1) / 3;
    extMat.color.copy(dayExt).lerp(duskExt, night);
    shell.sheer.emissiveIntensity = 0.1 * (1 - night);
    const e = cam.matrixWorld.elements, inside = e[12] > ROOM.x0 && e[12] < ROOM.x1 && e[14] > ROOM.z0 && e[14] < ROOM.z1 && e[13] < ROOM.h;
    if (!inside) { this.userData._cw = mat.colorWrite; mat.colorWrite = false; this.userData._hid = mat; }
  };
  shell.ext.onAfterRender = function () { const m = this.userData._hid; if (m) { m.colorWrite = this.userData._cw; this.userData._hid = null; } };

  const views = [
    { id: 'room:across', label: 'Across the room', position: V(0.2, 1.62, 4.6), target: V(0.0, 0.55, 0.6) },
    { id: 'room:window', label: 'By the window', position: V(-3.0, 1.62, 1.6), target: V(1.2, 0.5, 0.5) },
    { id: 'room:corner', label: 'Front-left corner', position: V(-2.5, 1.62, 3.0), target: V(0.5, 0.45, 0.6) },
  ];

  function set(param, value) {
    switch (param) {
      case 'decor': {
        const on = value === true || +value >= 0.5;
        decor.visible = on; params.decor = on ? 1 : 0;
        break;
      }
      case 'pillows': {
        const on = value === true || +value >= 0.5;
        pillows.visible = on; params.pillows = on ? 1 : 0;
        break;
      }
      case 'wall': {
        const w = WALL_COLOURS.find((c) => c.key === value);
        const hex = w ? w.hex : value;
        if (typeof hex !== 'string' && typeof hex !== 'number') return;
        wallMat.color.set(hex);
        skirtMat.color.set(hex).offsetHSL(0, -0.02, 0.015);
        state.wall = '#' + wallMat.color.getHexString();
        break;
      }
      case 'floor': {
        let k = value;
        if (typeof k === 'number') k = k >= 0.5 ? 'oak' : 'stone';
        if (k !== 'oak' && k !== 'stone') return;
        for (const f of shell.floors) f.material = floorMaterial(k);
        state.floor = k;
        break;
      }
      default: break;
    }
  }
  set('wall', state.wall);

  return {
    name: 'room',
    group,
    params,
    set,
    state,
    bounds: { minX: ROOM.x0, maxX: ROOM.x1, minZ: ROOM.z0, maxZ: ROOM.z1 },
    lights: [lamp.light],
    controls: [],
    seats: [],
    views,
  };
}
