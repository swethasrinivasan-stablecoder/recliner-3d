// materials.js — every shared material, procedural texture and colour palette.
// Modules only ever reference `M.<key>`; the app recolours by mutating these
// shared instances, so a palette change reaches every mesh at once.
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Palettes (Scandinavian, warm-neutral leaning)
// ---------------------------------------------------------------------------
export const FABRIC_COLOURS = [
  { key: 'havre',  name: 'Havre',  note: 'Oat',          hex: '#d6c8b1' },
  { key: 'sno',    name: 'Snö',    note: 'Snow',         hex: '#ebe6dc' },
  { key: 'dimma',  name: 'Dimma',  note: 'Mist grey',    hex: '#c2c1ba' },
  { key: 'lav',    name: 'Lav',    note: 'Lichen sage',  hex: '#a6ae96' },
  { key: 'mossa',  name: 'Mossa',  note: 'Moss',         hex: '#737a5c' },
  { key: 'fjord',  name: 'Fjord',  note: 'Dusty blue',   hex: '#8b9eac' },
  { key: 'lera',   name: 'Lera',   note: 'Clay',         hex: '#b7856a' },
  { key: 'senap',  name: 'Senap',  note: 'Ochre',        hex: '#c39d58' },
  { key: 'ljung',  name: 'Ljung',  note: 'Heather',      hex: '#c4a7a0' },
  { key: 'kaffe',  name: 'Kaffe',  note: 'Coffee',       hex: '#7a6252' },
  { key: 'skiffer',name: 'Skiffer',note: 'Slate',        hex: '#55585a' },
];

export const FABRIC_TYPES = [
  { key: 'chenille', name: 'Chenille' },
  { key: 'boucle',   name: 'Bouclé' },
  { key: 'linen',    name: 'Linen' },
  { key: 'velvet',   name: 'Velvet' },
  { key: 'leather',  name: 'Leather' },
];

export const LEG_FINISHES = [
  { key: 'gunmetal', name: 'Gunmetal',      hex: '#5b5d60' },
  { key: 'black',    name: 'Matte black',   hex: '#1e1e1f' },
  { key: 'brass',    name: 'Brushed brass', hex: '#b39258' },
  { key: 'oak',      name: 'Natural oak',   hex: '#c49a6c' },
  { key: 'smoked',   name: 'Smoked oak',    hex: '#6b4f3a' },
];

export const WALL_COLOURS = [
  { key: 'kalk',   name: 'Kalk',   hex: '#efebe4' },
  { key: 'grafit', name: 'Greige', hex: '#d9d2c6' },
  { key: 'salvia', name: 'Salvia', hex: '#c9cdbd' },
  { key: 'dis',    name: 'Dis',    hex: '#cdd3d6' },
  { key: 'natt',   name: 'Natt',   hex: '#3f4547' },
];

// Curated rooms: one click sets sofa fabric + texture + legs + accents + wall.
export const CURATED = [
  { key: 'hygge',   name: 'Hygge Oat',      fabric: 'havre', type: 'chenille', legs: 'gunmetal', accent: '#b7856a', throw: '#ebe6dc', wall: 'kalk'   },
  { key: 'cabin',   name: 'Sage Cabin',     fabric: 'lav',   type: 'boucle',   legs: 'oak',      accent: '#ebe6dc', throw: '#737a5c', wall: 'grafit' },
  { key: 'fjord',   name: 'Fjord Morning',  fabric: 'fjord', type: 'linen',    legs: 'oak',      accent: '#c39d58', throw: '#ebe6dc', wall: 'dis'    },
  { key: 'birch',   name: 'Birch & Snow',   fabric: 'sno',   type: 'boucle',   legs: 'black',    accent: '#8b9eac', throw: '#c2c1ba', wall: 'kalk'   },
  { key: 'lingon',  name: 'Lingon Clay',    fabric: 'lera',  type: 'velvet',   legs: 'brass',    accent: '#d6c8b1', throw: '#ebe6dc', wall: 'grafit' },
  { key: 'polar',   name: 'Polar Night',    fabric: 'skiffer',type:'chenille', legs: 'black',    accent: '#c39d58', throw: '#c2c1ba', wall: 'natt'   },
];

// ---------------------------------------------------------------------------
// Procedural, tileable textures
// ---------------------------------------------------------------------------
const TEX = 256;

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Tileable value noise sampled on an integer lattice that wraps at `period`.
function makeNoise(rand, period) {
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const at = (x, y) => g[((y % period + period) % period) * period + ((x % period + period) % period)];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

function heightField(kind) {
  const rand = seeded({ chenille: 11, boucle: 23, linen: 37, velvet: 41, leather: 53 }[kind] || 7);
  const h = new Float32Array(TEX * TEX);
  const n8 = makeNoise(rand, 8), n32 = makeNoise(rand, 32), n64 = makeNoise(rand, 64), n128 = makeNoise(rand, 128);
  const S = TEX;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      let val = 0;
      if (kind === 'chenille') {
        // soft horizontal pile rows with tufty noise
        const row = Math.sin((v * 48 + n32(u * 32, v * 32) * 0.8) * Math.PI * 2) * 0.5 + 0.5;
        val = row * 0.45 + n128(u * 128, v * 128) * 0.35 + n32(u * 32, v * 32) * 0.2;
      } else if (kind === 'linen') {
        const wu = Math.sin(u * 96 * Math.PI * 2) * 0.5 + 0.5;
        const wv = Math.sin(v * 96 * Math.PI * 2) * 0.5 + 0.5;
        const slub = n8(u * 8, v * 64 % 64) * 0.5;
        val = (Math.max(wu, wv) * 0.6 + slub * 0.3 + n128(u * 128, v * 128) * 0.25);
      } else if (kind === 'velvet') {
        val = n128(u * 128, v * 128) * 0.25 + n32(u * 32, v * 32) * 0.15;
      } else if (kind === 'leather') {
        // cellular-ish grain from abs-noise ridges
        const r1 = 1 - Math.abs(n32(u * 32, v * 32) * 2 - 1);
        const r2 = 1 - Math.abs(n64(u * 64, v * 64) * 2 - 1);
        val = Math.pow(r1, 6) * 0.6 + Math.pow(r2, 8) * 0.4;
        val = 1 - val;
      } else {
        val = n64(u * 64, v * 64);
      }
      h[y * S + x] = val;
    }
  }
  if (kind === 'boucle') {
    // scattered loops: stamp small rings with wrap-around
    for (let i = 0; i < 1400; i++) {
      const cx = rand() * S, cy = rand() * S, r = 2.2 + rand() * 3.2, w = 1.1 + rand() * 0.8;
      for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
        const d = Math.hypot(dx, dy);
        const ring = Math.exp(-((d - r) ** 2) / (w * w));
        const X = ((Math.floor(cx + dx) % S) + S) % S, Y = ((Math.floor(cy + dy) % S) + S) % S;
        h[Y * S + X] = Math.max(h[Y * S + X], ring * (0.7 + rand() * 0.3));
      }
    }
  }
  return h;
}

function toNormalCanvas(h, strength) {
  const S = TEX, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d'), img = ctx.createImageData(S, S), d = img.data;
  const H = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
    const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const len = Math.hypot(dx, dy, 1);
    const i = (y * S + x) * 4;
    d[i] = (-dx / len * 0.5 + 0.5) * 255;
    d[i + 1] = (dy / len * 0.5 + 0.5) * 255;
    d[i + 2] = (1 / len * 0.5 + 0.5) * 255;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function toToneCanvas(h, lo, hi) {
  const S = TEX, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d'), img = ctx.createImageData(S, S), d = img.data;
  for (let i = 0; i < S * S; i++) {
    const v = (lo + (hi - lo) * h[i]) * 255;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function canvasTex(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Per fabric type: normal strength, tone range, and physical response.
const FABRIC_SPECS = {
  chenille: { normal: 3.2, tone: [0.88, 1.0], roughness: 0.92, sheen: 0.35, sheenRoughness: 0.5, normalScale: 0.55, repeat: 1.0 },
  boucle:   { normal: 3.5, tone: [0.84, 1.0], roughness: 0.97, sheen: 0.3,  sheenRoughness: 0.8,  normalScale: 1.2, repeat: 1.0 },
  linen:    { normal: 4.0, tone: [0.88, 1.0], roughness: 0.95, sheen: 0.15, sheenRoughness: 0.9,  normalScale: 0.8, repeat: 1.0 },
  velvet:   { normal: 2.0, tone: [0.92, 1.0], roughness: 0.75, sheen: 1.0,  sheenRoughness: 0.35, normalScale: 0.4, repeat: 1.0 },
  leather:  { normal: 3.0, tone: [0.9, 1.0],  roughness: 0.5,  sheen: 0.0,  sheenRoughness: 0.5,  normalScale: 0.5, repeat: 1.0 },
};
const fabricTexCache = {};
function fabricTextures(kind) {
  if (!fabricTexCache[kind]) {
    const h = heightField(kind), spec = FABRIC_SPECS[kind];
    fabricTexCache[kind] = {
      normal: canvasTex(toNormalCanvas(h, spec.normal), false),
      tone: canvasTex(toToneCanvas(h, spec.tone[0], spec.tone[1]), true),
    };
  }
  return fabricTexCache[kind];
}

function woodTexture() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d'), img = ctx.createImageData(S, S), d = img.data;
  const rand = seeded(91), n = makeNoise(rand, 16), n2 = makeNoise(rand, 64);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const ring = Math.sin((v * 22 + n(u * 4, v * 16) * 3.0) * Math.PI * 2) * 0.5 + 0.5;
    const t = 0.78 + ring * 0.14 + n2(u * 64, v * 64) * 0.08;
    const i = (y * S + x) * 4;
    d[i] = 226 * t; d[i + 1] = 196 * t; d[i + 2] = 152 * t; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvasTex(c, true);
}

function glyphCanvas(kind) {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#16171a'; ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#f4f1ea'; ctx.fillStyle = '#f4f1ea';
  ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const chair = (lean) => {             // a tiny side-view chair, back leaning by `lean`
    ctx.beginPath();
    ctx.moveTo(34 - lean, 34); ctx.lineTo(40, 78); ctx.lineTo(86, 78);
    ctx.stroke();
  };
  const arrow = (up) => {
    ctx.beginPath();
    if (up) { ctx.moveTo(84, 52); ctx.lineTo(98, 34); ctx.lineTo(112, 52); }
    else    { ctx.moveTo(84, 36); ctx.lineTo(98, 54); ctx.lineTo(112, 36); }
    ctx.stroke();
  };
  if (kind === 'recline+') { chair(14); ctx.beginPath(); ctx.moveTo(86, 78); ctx.lineTo(104, 66); ctx.stroke(); }
  if (kind === 'recline-') { chair(-4); }
  if (kind === 'head+') { ctx.beginPath(); ctx.arc(46, 46, 14, 0, Math.PI * 2); ctx.fill(); arrow(true); }
  if (kind === 'head-') { ctx.beginPath(); ctx.arc(46, 46, 14, 0, Math.PI * 2); ctx.fill(); arrow(false); }
  if (kind === 'usb') { ctx.strokeRect(40, 50, 48, 26); }
  if (kind === 'bed') { ctx.strokeRect(24, 56, 80, 20); ctx.beginPath(); ctx.moveTo(24, 56); ctx.lineTo(24, 36); ctx.stroke(); }
  return c;
}

// ---------------------------------------------------------------------------
// Ghost (x-ray) shader: fresnel-weighted translucent shell
// ---------------------------------------------------------------------------
function makeGhost(colorHex) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(colorHex) }, uBase: { value: 0.05 }, uRim: { value: 0.55 } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uBase; uniform float uRim;
      varying vec3 vN; varying vec3 vV;
      void main(){
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float a = uBase + uRim * pow(f, 2.2);
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// ---------------------------------------------------------------------------
// Shared material instances
// ---------------------------------------------------------------------------
const fab0 = fabricTextures('chenille');
const woodMap = woodTexture();

export const M = {
  // Upholstery. `fabric` covers every visible upholstered surface (shell + cushions).
  fabric: new THREE.MeshPhysicalMaterial({
    color: '#d6c8b1', map: fab0.tone, normalMap: fab0.normal, normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.92, sheen: 0.35, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffffff'),
  }),
  // Slightly darker version of the fabric for seams, piping and stitch grooves.
  seam: new THREE.MeshStandardMaterial({ color: '#a89a84', roughness: 1 }),
  // Black dust-cover cloth on undersides / hidden faces.
  underside: new THREE.MeshStandardMaterial({ color: '#1b1b1c', roughness: 1 }),

  leg: new THREE.MeshStandardMaterial({ color: '#5b5d60', metalness: 0.85, roughness: 0.32 }),

  // Structure
  wood: new THREE.MeshStandardMaterial({ map: woodMap, color: '#ffffff', roughness: 0.75 }),
  ply: new THREE.MeshStandardMaterial({ color: '#d9c3a0', roughness: 0.8 }),
  steel: new THREE.MeshStandardMaterial({ color: '#4a4d52', metalness: 0.8, roughness: 0.38 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#d7d9dc', metalness: 1.0, roughness: 0.18 }),
  spring: new THREE.MeshStandardMaterial({ color: '#2b2d30', metalness: 0.6, roughness: 0.45 }),
  webbing: new THREE.MeshStandardMaterial({ color: '#3c3a36', roughness: 0.95 }),
  foam: new THREE.MeshStandardMaterial({ color: '#f2dc8a', roughness: 1, transparent: true, opacity: 0.42, depthWrite: false }),
  fibre: new THREE.MeshStandardMaterial({ color: '#f7f5ef', roughness: 1, transparent: true, opacity: 0.3, depthWrite: false }),
  motor: new THREE.MeshStandardMaterial({ color: '#202225', metalness: 0.3, roughness: 0.55 }),

  // Hard trim
  plastic: new THREE.MeshStandardMaterial({ color: '#19191b', roughness: 0.6 }),
  stainless: new THREE.MeshStandardMaterial({ color: '#c9cbce', metalness: 1.0, roughness: 0.22 }),
  panel: new THREE.MeshStandardMaterial({ color: '#16171a', metalness: 0.2, roughness: 0.25 }),
  led: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#cfe6ff', emissiveIntensity: 1.6 }),
  felt: new THREE.MeshStandardMaterial({ color: '#3b3d40', roughness: 1 }),
  rubber: new THREE.MeshStandardMaterial({ color: '#111112', roughness: 0.9 }),

  // Styling
  accent: new THREE.MeshPhysicalMaterial({ color: '#b7856a', roughness: 0.95, sheen: 0.5, sheenRoughness: 0.6, normalMap: fabricTextures('linen').normal, normalScale: new THREE.Vector2(0.7, 0.7) }),
  throw: new THREE.MeshPhysicalMaterial({ color: '#ebe6dc', roughness: 1, sheen: 0.4, sheenRoughness: 0.7, normalMap: fabricTextures('boucle').normal, normalScale: new THREE.Vector2(1.2, 1.2) }),
  ceramic: new THREE.MeshPhysicalMaterial({ color: '#f1ede6', roughness: 0.35, clearcoat: 0.6 }),
  coffee: new THREE.MeshStandardMaterial({ color: '#3a2618', roughness: 0.2 }),

  ghost: makeGhost('#cdbfa6'),
};

// Button glyph materials, keyed: 'recline+', 'recline-', 'head+', 'head-', 'usb', 'bed'.
const glyphCache = {};
export function glyphMaterial(kind) {
  if (!glyphCache[kind]) {
    const t = canvasTex(glyphCanvas(kind), true);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    glyphCache[kind] = new THREE.MeshStandardMaterial({
      map: t, roughness: 0.3, metalness: 0.1,
      emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.25,
    });
  }
  return glyphCache[kind];
}

// ---------------------------------------------------------------------------
// Mutators the app calls
// ---------------------------------------------------------------------------
export function setFabricColour(hex) {
  const c = new THREE.Color(hex);
  M.fabric.color.copy(c);
  const hsl = {}; c.getHSL(hsl);
  M.seam.color.setHSL(hsl.h, hsl.s * 0.9, Math.max(0.06, hsl.l * 0.72));
  M.ghost.uniforms.uColor.value.copy(c).lerp(new THREE.Color('#ffffff'), 0.15);
  // Light fabrics need a softer sheen so they don't wash out.
  const spec = FABRIC_SPECS[currentType];
  M.fabric.sheenColor.copy(c).lerp(new THREE.Color('#ffffff'), 0.35);
  M.fabric.sheen = spec.sheen * (hsl.l > 0.75 ? 0.6 : 1);
}

let currentType = 'chenille';
export function setFabricType(kind) {
  const spec = FABRIC_SPECS[kind];
  if (!spec) return;
  currentType = kind;
  const t = fabricTextures(kind);
  M.fabric.normalMap = t.normal;
  M.fabric.map = t.tone;
  M.fabric.normalScale.set(spec.normalScale, spec.normalScale);
  M.fabric.roughness = spec.roughness;
  M.fabric.sheen = spec.sheen;
  M.fabric.sheenRoughness = spec.sheenRoughness;
  M.fabric.clearcoat = kind === 'leather' ? 0.25 : 0;
  M.fabric.clearcoatRoughness = 0.6;
  M.fabric.needsUpdate = true;
  setFabricColour('#' + M.fabric.color.getHexString());
}

export function setLegFinish(key) {
  const f = LEG_FINISHES.find((l) => l.key === key);
  if (!f) return;
  const isWood = key === 'oak' || key === 'smoked';
  M.leg.color.set(f.hex);
  M.leg.metalness = isWood ? 0 : key === 'black' ? 0.4 : 0.9;
  M.leg.roughness = isWood ? 0.6 : key === 'black' ? 0.55 : key === 'brass' ? 0.35 : 0.3;
  M.leg.map = isWood ? woodMap : null;
  if (isWood) M.leg.color.set(key === 'oak' ? '#e0b78a' : '#7c5a42');
  M.leg.needsUpdate = true;
}

export function setAccentColour(hex) { M.accent.color.set(hex); }
export function setThrowColour(hex) { M.throw.color.set(hex); }
export const currentFabricType = () => currentType;
