// app.js — scene, lighting, sofa assembly, motion, camera rigs, picking and UI.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DIM, LAYOUT, LAYER, applyViewMode, softBox, clamp01, smooth } from './core.js';
import {
  M, FABRIC_COLOURS, FABRIC_TYPES, LEG_FINISHES, WALL_COLOURS, CURATED,
  setFabricColour, setFabricType, setLegFinish, setAccentColour, setThrowColour,
} from './materials.js';
import { createChaise } from './chaise.js';
import { createBedSeat } from './bedseat.js';
import { createConsole } from './console.js';
import { createRecliner } from './recliner.js';
import { createRoom } from './room.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const Q = new URLSearchParams(location.search);
const store = {
  get(k, d) { try { const v = localStorage.getItem('sofa3d:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sofa3d:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// Renderer & scene
// ---------------------------------------------------------------------------
const stage = $('#stage');
const canvas = $('#c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (e) {
  fatal('This view needs WebGL, which isn’t available in this browser or device.');
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;   // Khronos PBR Neutral: keeps fabric colours true
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#e6e1d8');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;

const camera = new THREE.PerspectiveCamera(40, 1, 0.03, 60);

const hemi = new THREE.HemisphereLight('#fff8ee', '#b8ab98', 0.85);
const sun = new THREE.DirectionalLight('#fff1de', 2.4);
sun.position.set(-4.6, 4.6, 3.2);
sun.target.position.set(0.2, 0.3, 0.9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -3.6, right: 3.6, top: 3.2, bottom: -2.4, near: 0.5, far: 16 });
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.025;
sun.shadow.radius = 5;
const fill = new THREE.DirectionalLight('#e8eef5', 0.45);
fill.position.set(3.5, 2.4, 5.5);
scene.add(hemi, sun, sun.target, fill);

// ---------------------------------------------------------------------------
// Sofa sizes. "Room-fit" is tuned to the vardagsrum (459 × 362 cm): it keeps a
// ~1 m walkway to the kitchen past the sofa's end. "As pictured" matches the photo.
// ---------------------------------------------------------------------------
const SIZES = {
  fit: { label: 'Room-fit', note: 'Leaves a 1 m walkway to the kitchen', W: { chaise: 0.95, bedseat: 0.80, console: 0.28, recliner: 0.66, arm: 0.15 } },
  pictured: { label: 'As pictured', note: 'Wider seats, tighter walkway', W: { chaise: 1.02, bedseat: 0.88, console: 0.28, recliner: 0.66, arm: 0.22 } },
};
const sizeKey = SIZES[Q.get('size')] ? Q.get('size') : (SIZES[store.get('size', 'fit')] ? store.get('size', 'fit') : 'fit');
Object.assign(DIM.W, SIZES[sizeKey].W);

// ---------------------------------------------------------------------------
// Sofa assembly
// ---------------------------------------------------------------------------
const BUILD = {
  chaise: () => createChaise({}),
  bedseat: () => createBedSeat({}),
  console: () => createConsole({ controlsFor: 'reclinerA' }),
  reclinerA: () => createRecliner({ id: 'reclinerA', rightArm: false }),
  reclinerB: () => createRecliner({ id: 'reclinerB', rightArm: true }),
};
const TARGET_W = { chaise: DIM.W.chaise, bedseat: DIM.W.bedseat, console: DIM.W.console, reclinerA: DIM.W.recliner, reclinerB: DIM.W.recliner + DIM.W.arm };

function placeholder(name) {
  const group = new THREE.Group();
  const w = TARGET_W[name], d = name === 'chaise' ? DIM.chaiseDepth : DIM.depth;
  const m = new THREE.Mesh(softBox(w - 0.01, DIM.seatH - DIM.legH, d, { r: 0.04 }), M.fabric);
  m.position.set(w / 2, (DIM.seatH + DIM.legH) / 2, d / 2);
  m.userData.layer = LAYER.SHELL;
  group.add(m);
  return { name, group, width: w, params: {}, set() {}, controls: [], seats: [] };
}

const sofa = new THREE.Group();
scene.add(sofa);
const mods = {};
const buildErrors = [];
for (const k of LAYOUT) {
  try { mods[k] = BUILD[k](); } catch (e) { console.error(`Building ${k} failed`, e); buildErrors.push(k); mods[k] = placeholder(k); }
  mods[k].name = k;
  // modules built at a fixed width are resized across their width only
  const sx = TARGET_W[k] / mods[k].width;
  if (Math.abs(sx - 1) > 0.002) { mods[k].group.scale.x = sx; mods[k].width = TARGET_W[k]; }
  sofa.add(mods[k].group);
}
const baseX = {};
let SOFA_W = 0;
for (const k of LAYOUT) { baseX[k] = SOFA_W; SOFA_W += mods[k].width; }

function layoutModules(spread) {
  const gap = 0.34 * spread;
  const total = SOFA_W + gap * (LAYOUT.length - 1);
  LAYOUT.forEach((k, i) => { mods[k].group.position.x = -total / 2 + baseX[k] + i * gap; });
}
layoutModules(0);

// soft contact shadow under each module (ambient occlusion on the floor)
const contactTex = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.shadowColor = 'rgba(0,0,0,1)'; g.shadowBlur = 26; g.shadowOffsetX = 1000;
  g.fillStyle = '#000'; g.fillRect(34 - 1000, 34, 188, 188);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const contactMat = new THREE.MeshBasicMaterial({ map: contactTex, color: '#3b3128', transparent: true, opacity: 0.42, depthWrite: false });
for (const k of LAYOUT) {
  const d = k === 'chaise' ? DIM.chaiseDepth : DIM.depth;
  const w = mods[k].width / mods[k].group.scale.x;      // local (unscaled) width
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.22 + 0.08, d * 1.18 + 0.08), contactMat);
  p.rotation.x = -Math.PI / 2;
  p.position.set(w / 2, 0.014, d / 2);
  p.renderOrder = 1;
  mods[k].group.add(p);
}

// ---------------------------------------------------------------------------
// The vardagsrum from the floor plan (metres). Sofa against the 4.59 m north wall,
// chaise at the window end; window on the 3.62 m west wall; TV on the bedroom wall.
// World frame: sofa centred on x, back face at z = 0, front toward +z (south).
// ---------------------------------------------------------------------------
const VR = {
  w: 4.59, d: 3.62, h: 2.6,
  wallGap: 0.12,           // behind the sofa (wall-hugger recliners need ~10 cm)
  windowGap: 0.12,         // chaise side to the window wall (radiator below the sill)
  window: [1.05, 3.10],    // along the west wall, from the north wall
  kitchen: [0.62, 1.76],   // opening in the east wall
  wc: [2.95, 3.75],        // WC door off the corridor
  tvWall: 3.33,            // bedroom wall length (TV wall); beyond it the corridor runs to the entré
  tv: { diag: 75, w: 1.66, h: 0.94, cy: 1.08 },
  unit: { w: 1.8, h: 0.36, d: 0.4, y0: 0.2 },
};
const RX0 = -SOFA_W / 2 - VR.windowGap, RZ0 = -VR.wallGap;
const rx = (x) => RX0 + x, rz = (z) => RZ0 + z;
const TV_X = THREE.MathUtils.clamp(0, rx(VR.tv.w / 2 + 0.3), rx(VR.tvWall - VR.tv.w / 2 - 0.25));
const COFFEE = { x: rx(1.55), z: rz(2.27), d: 0.6 };
const PLAN = {
  room: { x0: rx(0), x1: rx(VR.w), z0: rz(0), z1: rz(VR.d), h: VR.h },
  window: { z0: rz(VR.window[0]), z1: rz(VR.window[1]), y0: 0.82, y1: 2.32 },
  rug: { cx: rx(1.85), cz: rz(1.85), w: 3.0, d: 2.0 },
  east: [{ z0: rz(VR.kitchen[0]), z1: rz(VR.kitchen[1]), h: 2.1 }, { z0: rz(VR.wc[0]), z1: rz(VR.wc[1]), h: 2.05 }],
  tvWallEnd: rx(VR.tvWall),
  corridor: 1.2,
  coffee: COFFEE,
};

// Room
let room = null;
try {
  room = createRoom({ sofaWidth: SOFA_W, sofaDepth: DIM.chaiseDepth, plan: PLAN });
  scene.add(room.group);
  for (const l of room.lights || []) l.userData.baseIntensity = l.intensity;
} catch (e) {
  console.error('Building the room failed', e);
  const f = new THREE.Mesh(new THREE.PlaneGeometry(14, 12), new THREE.MeshStandardMaterial({ color: '#d9d2c6', roughness: 0.9 }));
  f.rotation.x = -Math.PI / 2; f.position.z = 2.5; f.receiveShadow = true; scene.add(f);
}
const ROOM_B = room?.bounds || { minX: PLAN.room.x0, maxX: PLAN.room.x1, minZ: PLAN.room.z0, maxZ: PLAN.room.z1 };

// TV wall (the bedroom wall): 75" TV over a floating white media unit, plus the linen
// pendant from the photo. Single-sided, and hidden while the camera is outside it.
const facing = (() => {
  const g = new THREE.Group();
  const z = PLAN.room.z1, wx0 = PLAN.room.x0, wx1 = PLAN.tvWallEnd;
  const wallMat = new THREE.MeshStandardMaterial({ color: '#efebe4', roughness: 0.95 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(wx1 - wx0, VR.h), wallMat);
  wall.position.set((wx0 + wx1) / 2, VR.h / 2, z);
  wall.rotation.y = Math.PI;
  wall.receiveShadow = true;
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(wx1 - wx0, 0.08, 0.012), new THREE.MeshStandardMaterial({ color: '#f4f1ec', roughness: 0.6 }));
  skirt.position.set(wall.position.x, 0.04, z - 0.006);
  const mount = new THREE.Group();          // everything on/in front of the TV wall
  const white = new THREE.MeshStandardMaterial({ color: '#f5f4f0', roughness: 0.5 });
  const U = VR.unit;
  const unit = new THREE.Mesh(softBox(U.w, U.h, U.d, { r: 0.008, edgeSeg: 2 }), white);
  unit.position.set(TV_X, U.y0 + U.h / 2, z - U.d / 2);
  unit.castShadow = unit.receiveShadow = true;
  mount.add(unit);
  const doorMat = new THREE.MeshStandardMaterial({ color: '#f8f7f3', roughness: 0.45 });
  for (let i = 0; i < 3; i++) {
    const dw = (U.w - 0.02) / 3;
    const d = new THREE.Mesh(softBox(dw - 0.008, U.h - 0.03, 0.012, { r: 0.004, edgeSeg: 1 }), doorMat);
    d.position.set(TV_X - U.w / 2 + 0.01 + dw * (i + 0.5), U.y0 + U.h / 2, z - U.d - 0.004);
    const inset = new THREE.Mesh(new THREE.BoxGeometry(dw - 0.09, U.h - 0.11, 0.004), white);
    inset.position.copy(d.position).add(new THREE.Vector3(0, 0, -0.006));
    mount.add(d, inset);
  }
  // TV: a dark glossy panel whose screen lights up for movie night
  const sc = document.createElement('canvas'); sc.width = 512; sc.height = 288;
  const c = sc.getContext('2d');
  const sky = c.createLinearGradient(0, 0, 0, 288);
  sky.addColorStop(0, '#20324a'); sky.addColorStop(0.55, '#c98a5c'); sky.addColorStop(1, '#2a2622');
  c.fillStyle = sky; c.fillRect(0, 0, 512, 288);
  c.fillStyle = '#f4c58a'; c.beginPath(); c.arc(330, 168, 26, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#1b2028';
  c.beginPath(); c.moveTo(0, 210); c.lineTo(90, 150); c.lineTo(170, 196); c.lineTo(260, 128); c.lineTo(380, 204); c.lineTo(450, 166); c.lineTo(512, 196); c.lineTo(512, 288); c.lineTo(0, 288); c.fill();
  const screenTex = new THREE.CanvasTexture(sc); screenTex.colorSpace = THREE.SRGBColorSpace;
  const T = VR.tv;
  const tvBody = new THREE.Mesh(new THREE.BoxGeometry(T.w + 0.012, T.h + 0.012, 0.03), new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.4, metalness: 0.3 }));
  tvBody.position.set(TV_X, T.cy, z - 0.04);
  const screenMat = new THREE.MeshStandardMaterial({ color: '#0b0c0d', roughness: 0.12, metalness: 0.1, emissive: '#ffffff', emissiveMap: screenTex, emissiveIntensity: 0 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(T.w, T.h), screenMat);
  screen.position.set(TV_X, T.cy, z - 0.0555);
  screen.rotation.y = Math.PI;
  const bar = new THREE.Mesh(softBox(1.0, 0.06, 0.1, { r: 0.02, edgeSeg: 2 }), new THREE.MeshStandardMaterial({ color: '#2a2c2e', roughness: 0.7 }));
  bar.position.set(TV_X, U.y0 + U.h + 0.03, z - 0.2);
  const vase = new THREE.Mesh(new THREE.LatheGeometry([0.0, 0.05, 0.065, 0.06, 0.035, 0.04].map((r, i) => new THREE.Vector2(r, i * 0.05)), 24), M.ceramic);
  vase.position.set(TV_X + U.w / 2 - 0.16, U.y0 + U.h, z - 0.2);
  for (const m of [tvBody, screen, bar, vase]) { m.castShadow = true; mount.add(m); }
  g.add(wall, skirt, mount);
  // linen drum pendant over the coffee table (like the listing photo)
  const pend = new THREE.Group();
  const linen = new THREE.MeshStandardMaterial({ color: '#e9e4da', roughness: 0.95, transparent: true, opacity: 0.82, side: THREE.DoubleSide, emissive: '#ffd9a8', emissiveIntensity: 0.08 });
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.34, 40, 1, true), linen);
  const blk = new THREE.MeshStandardMaterial({ color: '#1d1e20', roughness: 0.5, metalness: 0.4 });
  const cordLen = VR.h - 2.05;
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, cordLen, 6), blk);
  cord.position.y = 0.17 + cordLen / 2;
  const ringT = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.004, 6, 48).rotateX(Math.PI / 2), blk); ringT.position.y = 0.17;
  const ringB = ringT.clone(); ringB.position.y = -0.17;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffd9a8', emissiveIntensity: 1.2 }));
  pend.add(drum, cord, ringT, ringB, bulb);
  pend.position.set(COFFEE.x + 0.35, 2.05 - 0.17, COFFEE.z - 0.2);
  const pendLight = new THREE.PointLight('#ffd2a0', 0.8, 5, 2);
  pendLight.position.copy(pend.position);
  pendLight.userData.baseIntensity = 0.8;
  if (room) (room.lights = room.lights || []).push(pendLight);
  g.add(pend, pendLight);
  scene.add(g);
  return { group: g, mount, wallMat, screenMat, pend };
})();
function syncFacing() {
  // dollhouse: hide the TV + unit when the camera is outside the TV wall (unless looking down from above)
  const p = camera.position;
  facing.mount.visible = p.z < PLAN.room.z1 || p.y > VR.h;
}

// ---------------------------------------------------------------------------
// Motion: every animatable parameter moves at a motor-like constant speed
// ---------------------------------------------------------------------------
const SPEED = { recline: 0.27, head: 0.6, bed: 0.34, storage: 0.6, lid: 1.15, cups: 1.6, explode: 0.9 };
const anim = {};
function A(mod, param) {
  const k = mod + ':' + param;
  if (!anim[k]) {
    const v = mod === 'sofa' ? 0 : (mods[mod]?.params?.[param] ?? 0);
    anim[k] = { mod, param, value: v, target: v };
  }
  return anim[k];
}
function setTarget(mod, param, t) { A(mod, param).target = clamp01(t); }
function jump(mod, param, v) { const a = A(mod, param); a.value = a.target = clamp01(v); applyParam(mod, param, a.value); }
function applyParam(mod, param, v) {
  if (mod === 'sofa' && param === 'explode') {
    layoutModules(v);
    for (const k of LAYOUT) safeSet(k, 'explode', v);
    for (const k of LAYOUT) applyViewMode(mods[k].group, view.mode);
    return;
  }
  if (!mods[mod]) return;
  safeSet(mod, param, v);
  applyViewMode(mods[mod].group, view.mode);
}
function safeSet(mod, param, v) {
  try { mods[mod].set(param, v); } catch (e) { console.error(`${mod}.set(${param})`, e); }
}
function tickAnims(dt) {
  let moving = false;
  for (const a of Object.values(anim)) {
    if (a.value === a.target) continue;
    moving = true;
    const step = (SPEED[a.param] || 0.6) * dt * (a.mod === 'sofa' ? 1 : 1);
    const d = a.target - a.value;
    a.value = Math.abs(d) <= step ? a.target : a.value + Math.sign(d) * step;
    applyParam(a.mod, a.param, a.value);
  }
  if (moving) syncMotionUI();
}

// press / hold semantics shared by 3D switches and UI buttons:
// tap → runs to the end; press-and-hold → moves only while held.
function press(id) {
  const [mod, param, dir] = id.split(':');
  const a = A(mod, param);
  if (dir === 'toggle') { a.target = a.target > 0.5 ? 0 : 1; return null; }
  a.target = dir === '+' ? 1 : 0;
  return { a, t: performance.now() };
}
function release(h) {
  if (!h) return;
  if (performance.now() - h.t > 380) h.a.target = h.a.value;
}

// ---------------------------------------------------------------------------
// View modes (finished / x-ray / frame)
// ---------------------------------------------------------------------------
const view = { mode: 'finished' };
function setMode(mode) {
  view.mode = mode;
  for (const k of LAYOUT) applyViewMode(mods[k].group, mode);
  syncRoomPillows();
  $$('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
}

// ---------------------------------------------------------------------------
// Controls (3D switches) registry
// ---------------------------------------------------------------------------
const controls = [];
for (const k of LAYOUT) {
  for (const c of mods[k].controls || []) {
    if (!c || !c.object) continue;
    c.meshes = [];
    // Controls keep their SHARED materials (so upholstery recolours with the sofa);
    // hover glow swaps in a temporary clone and swaps the shared one back after.
    c.object.traverse((o) => {
      if (!o.isMesh) return;
      o.userData.control = c;
      c.meshes.push(o);
    });
    controls.push(c);
  }
}
function glowClone(m) {
  const g = m.clone();
  if (g.emissive) { g.emissive.set('#ffd9a0'); g.emissiveIntensity = 0.45; g.emissiveMap = null; }
  return g;
}
function highlight(c, on) {
  if (!c) return;
  for (const o of c.meshes) {
    const base = o.userData.baseMat || o.material;
    if (on) {
      if (o.material !== base) continue;            // ghosted in x-ray: leave it
      o.userData.glow = Array.isArray(base) ? base.map(glowClone) : glowClone(base);
      o.material = o.userData.glow;
    } else if (o.userData.glow) {
      if (o.material === o.userData.glow) o.material = base;
      (Array.isArray(o.userData.glow) ? o.userData.glow : [o.userData.glow]).forEach((m) => m.dispose());
      o.userData.glow = null;
    }
  }
}
for (const k of LAYOUT) applyViewMode(mods[k].group, 'finished');

// ---------------------------------------------------------------------------
// Camera rigs: orbit / stand (eye height, walk) / sit (seat anchor)
// ---------------------------------------------------------------------------
const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
orbit.minDistance = 1.0;
orbit.maxDistance = 18;
orbit.maxPolarAngle = THREE.MathUtils.degToRad(87);
orbit.rotateSpeed = 0.7;
orbit.target.set(0.15, 0.48, 0.75);
camera.position.set(-3.05, 2.1, 5.0);
orbit.update();

const RCX = (PLAN.room.x0 + PLAN.room.x1) / 2, RCZ = (PLAN.room.z0 + PLAN.room.z1) / 2;
const ORBIT_SHOTS = {
  photo: { label: 'Your photo', note: 'Front-left, chaise near', pos: [-3.05, 2.1, 5.0], target: [0.15, 0.48, 0.75] },
  plan: { label: 'Floor plan', note: 'Vardagsrum from above', pos: [RCX + 0.3, 17, RCZ + 0.02], target: [RCX + 0.3, 0, RCZ], fov: 19 },
  front: { label: 'Straight on', note: 'Whole sofa', pos: [0.0, 1.35, 5.2], target: [0.0, 0.5, 0.7] },
  right: { label: 'Recliners', note: 'From the right', pos: [3.2, 1.45, 3.1], target: [0.9, 0.5, 0.8] },
};
const STAND_SPOTS = {
  tv: { label: 'From the TV', note: 'Your view of the sofa', pos: [rx(1.35), rz(3.12)], look: [0.0, 0.55, 0.6] },
  listing: { label: 'Listing photo', note: 'From the kitchen side', pos: [rx(4.2), rz(1.15)], look: [rx(0.2), 1.0, rz(2.15)] },
  hall: { label: 'From the hall', note: 'Walking in from the entré', pos: [rx(3.95), rz(4.35)], look: [-0.3, 0.6, 0.8] },
  window: { label: 'By the window', note: 'Looking along the sofa', pos: [rx(0.45), rz(2.95)], look: [rx(3.2), 0.5, 0.5] },
  near: { label: 'Up close', note: 'In front of the recliners', pos: [0.9, 2.2], look: [0.9, 0.35, 0.6] },
};
const SEAT_ORDER = ['reclinerA', 'reclinerB', 'bedseat', 'chaise'];
const SEAT_NOTES = { reclinerA: 'Power recliner', reclinerB: 'Power recliner, by the arm', bedseat: 'Over the pull-out bed', chaise: 'Legs up on the divan' };
const EYE = 1.62;

const rig = {
  mode: 'orbit',
  seat: 'reclinerA',
  stand: { pos: new THREE.Vector3(0.2, EYE, 4.6), yaw: 0, pitch: -0.1 },
  sit: { yaw: 0, pitch: 0, fov: 66 },
  saved: { pos: camera.position.clone(), target: orbit.target.clone(), fov: 40 },
  trans: null,
  orbitTween: null,
};
function seatAnchor(id) {
  const s = (mods[id]?.seats || [])[0];
  return s && s.anchor ? s : null;
}
function lookYawPitch(from, to) {
  const d = tmpV.copy(to).sub(from).normalize();
  return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) };
}
function standDir(yaw, pitch, out) {
  return out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}
function poseQuat(pos, look, out) {
  tmpM.lookAt(pos, look, UP);
  return out.setFromRotationMatrix(tmpM);
}

const desired = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 40 };
function computeDesired() {
  if (rig.mode === 'orbit') {
    desired.pos.copy(rig.saved.pos);
    poseQuat(desired.pos, rig.saved.target, desired.quat);
    desired.fov = rig.saved.fov || 40;
  } else if (rig.mode === 'stand') {
    desired.pos.copy(rig.stand.pos);
    const d = standDir(rig.stand.yaw, rig.stand.pitch, tmpV2);
    poseQuat(desired.pos, tmpV.copy(desired.pos).add(d), desired.quat);
    desired.fov = 58;
  } else {
    const s = seatAnchor(rig.seat);
    if (!s) return;
    s.anchor.updateWorldMatrix(true, false);
    s.anchor.getWorldPosition(desired.pos);
    s.anchor.getWorldQuaternion(tmpQ);
    const y = rig.sit.yaw, p = rig.sit.pitch;
    const dir = tmpV2.set(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)).applyQuaternion(tmpQ);
    poseQuat(desired.pos, tmpV.copy(desired.pos).add(dir), desired.quat);
    desired.fov = rig.sit.fov;
  }
}

function setView(mode, opt = {}) {
  if (rig.mode === 'orbit' && !rig.trans) {
    rig.saved.pos.copy(camera.position);
    rig.saved.target.copy(orbit.target);
    rig.saved.fov = camera.fov;
  }
  if (mode === 'sit') {
    if (opt.seat) rig.seat = opt.seat;
    rig.sit.yaw = 0; rig.sit.pitch = 0;
  }
  if (mode === 'stand') applySpot(opt.spot || (rig.mode === 'stand' ? null : 'tv'));
  if (mode === 'orbit' && opt.shot) {
    const s = ORBIT_SHOTS[opt.shot];
    rig.saved.pos.set(...s.pos); rig.saved.target.set(...s.target); rig.saved.fov = s.fov || 40;
  }
  rig.mode = mode;
  orbit.enabled = false;
  rig.trans = { pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov, t: reduceMotion ? 1 : 0 };
  syncViewUI();
  renderHud();
}
function applySpot(key) {
  if (!key) return;
  const s = STAND_SPOTS[key];
  rig.stand.pos.set(s.pos[0], EYE, s.pos[1]);
  const yp = lookYawPitch(rig.stand.pos, tmpV2.set(...s.look));
  rig.stand.yaw = yp.yaw; rig.stand.pitch = yp.pitch;
  rig.spot = key;
}

function updateCamera(dt) {
  if (rig.trans) {
    computeDesired();
    rig.trans.t = Math.min(1, rig.trans.t + dt / 0.95);
    const e = smooth(rig.trans.t);
    camera.position.lerpVectors(rig.trans.pos, desired.pos, e);
    camera.quaternion.slerpQuaternions(rig.trans.quat, desired.quat, e);
    camera.fov = THREE.MathUtils.lerp(rig.trans.fov, desired.fov, e);
    camera.updateProjectionMatrix();
    if (rig.trans.t >= 1) {
      rig.trans = null;
      if (rig.mode === 'orbit') {
        orbit.target.copy(rig.saved.target);
        camera.position.copy(rig.saved.pos);
        orbit.enabled = true;
        orbit.update();
      }
    }
    return;
  }
  if (rig.mode === 'orbit') {
    orbit.update();
    // keep the orbit target near the sofa
    orbit.target.x = THREE.MathUtils.clamp(orbit.target.x, PLAN.room.x0 - 0.5, PLAN.room.x1 + 0.5);
    orbit.target.y = THREE.MathUtils.clamp(orbit.target.y, 0.0, 1.6);
    orbit.target.z = THREE.MathUtils.clamp(orbit.target.z, PLAN.room.z0 - 0.3, PLAN.room.z1 + 0.6);
    if (camera.position.y < 0.08) camera.position.y = 0.08;
    return;
  }
  computeDesired();
  camera.position.copy(desired.pos);
  camera.quaternion.copy(desired.quat);
  if (Math.abs(camera.fov - desired.fov) > 0.01) { camera.fov = desired.fov; camera.updateProjectionMatrix(); }
}

// walking (stand mode)
const keys = new Set();
const walkPad = new Set();
addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, textarea')) return;
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k) && rig.mode === 'stand') { keys.add(k); e.preventDefault(); }
  if (k === 'escape' && rig.mode !== 'orbit') setView('orbit');
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => { keys.clear(); walkPad.clear(); });

function walkable(x, z) {
  const m = 0.22, R = PLAN.room;
  const inRoom = x > R.x0 + m && x < R.x1 - m && z > R.z0 + m && z < R.z1 - m;
  const inHall = x > PLAN.tvWallEnd + m && x < R.x1 - m && z > R.z1 - 0.4 && z < R.z1 + PLAN.corridor - m;
  return (inRoom || inHall) && !inSofaZone(x, z);
}
function inSofaZone(x, z) {
  const m = 0.24;
  const hw = SOFA_W / 2;
  if (x > -hw - m && x < hw + m && z < DIM.depth + 0.35 + m) return true; // main body + footrest reach
  if (x > -hw - m && x < -hw + DIM.W.chaise + DIM.W.bedseat + m && z < DIM.chaiseDepth + m) return true; // chaise + bed
  return false;
}
function tickWalk(dt) {
  if (rig.mode !== 'stand' || rig.trans) return;
  let f = 0, s = 0;
  if (keys.has('w') || keys.has('arrowup') || walkPad.has('f')) f += 1;
  if (keys.has('s') || keys.has('arrowdown') || walkPad.has('b')) f -= 1;
  if (keys.has('d') || walkPad.has('r')) s += 1;
  if (keys.has('a') || walkPad.has('l')) s -= 1;
  if (keys.has('arrowleft')) rig.stand.yaw += 1.6 * dt;
  if (keys.has('arrowright')) rig.stand.yaw -= 1.6 * dt;
  if (!f && !s) return;
  const sp = 1.5 * dt, y = rig.stand.yaw;
  moveStand(-Math.sin(y) * f * sp + Math.cos(y) * s * sp, -Math.cos(y) * f * sp - Math.sin(y) * s * sp);
}
function moveStand(dx, dz) {
  const p = rig.stand.pos;
  const nx = p.x + dx, nz = p.z + dz;
  if (walkable(nx, nz)) { p.x = nx; p.z = nz; }
  else if (walkable(nx, p.z)) p.x = nx;
  else if (walkable(p.x, nz)) p.z = nz;
}

// ---------------------------------------------------------------------------
// Picking: hover tooltips, 3D switch presses, drag-to-look
// ---------------------------------------------------------------------------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tip = $('#tip');
let hover = null, hoverDirty = false, pointerIn = false, pointerXY = [0, 0];
let held = null, heldCtl = null, drag = null;

function isInside(o, root) { for (let p = o; p; p = p.parent) if (p === root) return true; return false; }
function visibleChain(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }
function pick(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObject(sofa, true);
  for (const h of hits) {
    const o = h.object;
    if (!o.isMesh || !visibleChain(o)) continue;
    if (o.material === contactMat) continue;
    if (o.userData.control) return { control: o.userData.control, object: o };
    if (view.mode === 'xray' && (o.userData.layer === LAYER.SHELL || o.userData.layer === LAYER.CUSHION)) continue;
    if (view.mode !== 'finished' && o.userData.label) return { label: o.userData.label, object: o };
    if (view.mode === 'finished') return null; // upholstery blocks what's behind it
  }
  return null;
}
function showTip(text, sub) {
  tip.innerHTML = '';
  tip.append(text);
  if (sub) { const s = document.createElement('small'); s.textContent = sub; tip.append(s); }
  tip.classList.add('show');
  placeTip();
}
function placeTip() {
  const r = stage.getBoundingClientRect();
  const x = Math.min(pointerXY[0] - r.left + 14, r.width - tip.offsetWidth - 8);
  const y = Math.max(8, pointerXY[1] - r.top - tip.offsetHeight - 12);
  tip.style.transform = `translate(${x}px, ${y}px)`;
}
function hideTip() { tip.classList.remove('show'); }
function doHover() {
  hoverDirty = false;
  if (!pointerIn || drag?.moved) { setHover(null); return; }
  const h = pick(pointerXY[0], pointerXY[1]);
  setHover(h);
}
function setHover(h) {
  const prevCtl = hover?.control, nextCtl = h?.control;
  if (prevCtl !== nextCtl) { highlight(prevCtl, false); highlight(nextCtl, true); }
  hover = h;
  canvas.style.cursor = h?.control ? 'pointer' : (rig.mode === 'orbit' ? 'grab' : 'grab');
  if (h?.control) showTip(h.control.hint || 'Press', controlSub(h.control));
  else if (h?.label) showTip(h.label);
  else hideTip();
}
function controlSub(c) {
  const [mod, param, dir] = c.id.split(':');
  const names = { reclinerA: 'Left recliner', reclinerB: 'Right recliner', bedseat: 'Single seat', chaise: 'Chaise', console: 'Console' };
  if (dir === 'toggle') return `${names[mod] || mod} · click`;
  return `${names[mod] || mod} · tap, or hold to stop anywhere`;
}

canvas.addEventListener('pointerdown', (e) => {
  pointerXY = [e.clientX, e.clientY];
  const h = pick(e.clientX, e.clientY);
  if (h?.control) {
    e.preventDefault();
    e.stopImmediatePropagation();
    orbit.enabled = false;
    heldCtl = h.control;
    held = press(h.control.id);
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  if (rig.mode !== 'orbit') {
    drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  } else {
    drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId, orbit: true };
  }
}, { capture: true });

canvas.addEventListener('pointermove', (e) => {
  pointerXY = [e.clientX, e.clientY];
  pointerIn = true;
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (!drag.orbit) {
      const k = 0.0042 * (camera.fov / 60);
      if (rig.mode === 'stand') {
        rig.stand.yaw += dx * k;
        rig.stand.pitch = THREE.MathUtils.clamp(rig.stand.pitch + dy * k, -1.2, 1.1);
      } else if (rig.mode === 'sit') {
        rig.sit.yaw = THREE.MathUtils.clamp(rig.sit.yaw + dx * k, -1.9, 1.9);
        rig.sit.pitch = THREE.MathUtils.clamp(rig.sit.pitch + dy * k, -1.0, 1.0);
      }
      drag.x = e.clientX; drag.y = e.clientY;
    }
  }
  hoverDirty = true;
  if (tip.classList.contains('show')) placeTip();
});
function endPointer(e) {
  if (heldCtl) {
    release(held);
    held = null; heldCtl = null;
    if (rig.mode === 'orbit' && !rig.trans) orbit.enabled = true;
  }
  if (drag) {
    if (e.type === 'pointerup' && !drag.moved && e.pointerType === 'touch') {
      // tap on a part in x-ray/frame mode shows its name
      const h = pick(e.clientX, e.clientY);
      if (h?.label) { showTip(h.label); setTimeout(hideTip, 1800); }
    }
    drag = null;
    canvas.style.cursor = 'grab';
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { pointerIn = false; if (!drag) setHover(null); });
canvas.addEventListener('wheel', (e) => {
  if (rig.mode === 'stand') {
    e.preventDefault();
    const y = rig.stand.yaw, d = -Math.sign(e.deltaY) * 0.25;
    moveStand(-Math.sin(y) * d, -Math.cos(y) * d);
  } else if (rig.mode === 'sit') {
    e.preventDefault();
    rig.sit.fov = THREE.MathUtils.clamp(rig.sit.fov + Math.sign(e.deltaY) * 4, 38, 84);
  }
}, { passive: false });

// ---------------------------------------------------------------------------
// Hotspots: floating labels on every moving feature (orbit / stand views)
// ---------------------------------------------------------------------------
const HOTSPOTS = [
  { key: 'reclinerA', label: 'Recline', ids: ['reclinerA:recline:+', 'reclinerA:recline:-'], seat: 'reclinerA', act: () => toggleTo('reclinerA', 'recline'), on: () => A('reclinerA', 'recline').target > 0.5 },
  { key: 'reclinerB', label: 'Recline', ids: ['reclinerB:recline:+', 'reclinerB:recline:-'], seat: 'reclinerB', act: () => toggleTo('reclinerB', 'recline'), on: () => A('reclinerB', 'recline').target > 0.5 },
  { key: 'bed', label: 'Pull-out bed', ids: ['bedseat:bed:toggle'], act: () => toggleTo('bedseat', 'bed'), on: () => A('bedseat', 'bed').target > 0.5 },
  { key: 'lid', label: 'Storage', ids: ['console:lid:toggle'], act: () => toggleTo('console', 'lid'), on: () => A('console', 'lid').target > 0.5 },
  { key: 'storage', label: 'Chaise storage', ids: ['chaise:storage:toggle'], act: () => toggleTo('chaise', 'storage'), on: () => A('chaise', 'storage').target > 0.5 },
];
function toggleTo(mod, param) { const a = A(mod, param); a.target = a.target > 0.5 ? 0 : 1; syncMotionUI(); }
const hsLayer = $('#hotspots');
const hsBox = new THREE.Box3();
for (const h of HOTSPOTS) {
  h.ctls = controls.filter((c) => h.ids.includes(c.id));
  if (!h.ctls.length) continue;
  const b = document.createElement('button');
  b.className = 'hs';
  b.type = 'button';
  b.textContent = h.label;
  b.addEventListener('click', () => { h.act(); });
  hsLayer.append(b);
  h.el = b;
  h.world = new THREE.Vector3();
}
let hsFrame = 0;
const occRay = new THREE.Raycaster();
function updateHotspots() {
  const show = $('#tg-hotspots').checked && rig.mode !== 'sit' && !rig.trans;
  hsLayer.style.display = show ? '' : 'none';
  if (!show) return;
  const W = stage.clientWidth, H = stage.clientHeight;
  const doOcc = (hsFrame++ % 12) === 0;
  for (const h of HOTSPOTS) {
    if (!h.el) continue;
    if (h.seat) {
      // label sits on the seat itself (the switch panel is small and tucked at the side)
      const g = mods[h.seat].group;
      h.world.set(g.position.x + DIM.W.recliner / 2, DIM.seatH + 0.02, DIM.depth - 0.12 + A(h.seat, 'recline').value * 0.15);
    } else {
      hsBox.makeEmpty();
      for (const c of h.ctls) hsBox.expandByObject(c.object);
      hsBox.getCenter(h.world);
    }
    tmpV.copy(h.world).project(camera);
    const behind = tmpV.z > 1 || tmpV.z < -1;
    const x = (tmpV.x * 0.5 + 0.5) * W, y = (-tmpV.y * 0.5 + 0.5) * H;
    h.el.style.visibility = behind || x < -40 || x > W + 40 || y < -20 || y > H + 20 ? 'hidden' : 'visible';
    h.el.style.transform = `translate(${x.toFixed(1)}px, ${(y - 18).toFixed(1)}px) translate(-50%, -50%)`;
    h.el.classList.toggle('on', h.on());
    if (doOcc) {
      const dist = camera.position.distanceTo(h.world);
      occRay.set(camera.position, tmpV2.copy(h.world).sub(camera.position).normalize());
      occRay.far = dist - 0.04;
      const hit = occRay.intersectObject(sofa, true).find((x) => x.object.isMesh && x.object.material !== contactMat && visibleChain(x.object) && !(view.mode === 'xray' && (x.object.userData.layer === LAYER.SHELL || x.object.userData.layer === LAYER.CUSHION)) && !h.ctls.some((c) => c.meshes.includes(x.object)) && !(h.seat && isInside(x.object, mods[h.seat].group)));
      h.el.classList.toggle('dim', !!hit);
    }
  }
}

// ---------------------------------------------------------------------------
// Dimensions overlay
// ---------------------------------------------------------------------------
const dims = new THREE.Group();
dims.visible = false;
scene.add(dims);
const dimMat = new THREE.LineBasicMaterial({ color: '#2b2f31', transparent: true, opacity: 0.85, depthTest: false });
const dimLabels = $('#dimlabels');
const dimDefs = [];
function dimLine(a, b, text, tick = new THREE.Vector3(0, 0.04, 0)) {
  const pts = [a, b, a.clone().add(tick), a.clone().sub(tick), b.clone().add(tick), b.clone().sub(tick)];
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  g.setIndex([0, 1, 2, 3, 4, 5]);
  const l = new THREE.LineSegments(g, dimMat);
  l.renderOrder = 10;
  dims.add(l);
  const el = document.createElement('div');
  el.className = 'dl';
  el.textContent = text;
  dimLabels.append(el);
  dimDefs.push({ el, at: a.clone().add(b).multiplyScalar(0.5), line: l });
}
// seated eye ≈ 0.57 m in front of the back face; open footrest reaches ≈ 1.60 m
const EYE_Z = 0.57, FOOTREST_Z = 1.6;
const BED = { x0: -SOFA_W / 2 + 0.17 * DIM.W.chaise / 1.02, x1: -SOFA_W / 2 + DIM.W.chaise + DIM.W.bedseat - 0.01 };
function buildDims() {
  const hw = SOFA_W / 2, cm = (m) => `${Math.round(m * 100)} cm`;
  const zf = DIM.chaiseDepth + 0.14;
  dimLine(new THREE.Vector3(-hw, 0.02, zf), new THREE.Vector3(hw, 0.02, zf), `${cm(SOFA_W)} overall`, new THREE.Vector3(0, 0, 0.05));
  dimLine(new THREE.Vector3(-hw - 0.14, 0.02, 0), new THREE.Vector3(-hw - 0.14, 0.02, DIM.chaiseDepth), `${cm(DIM.chaiseDepth)} chaise`, new THREE.Vector3(0.05, 0, 0));
  dimLine(new THREE.Vector3(hw + 0.14, 0.02, 0), new THREE.Vector3(hw + 0.14, 0.02, DIM.depth), `${cm(DIM.depth)} deep`, new THREE.Vector3(0.05, 0, 0));
  dimLine(new THREE.Vector3(hw + 0.14, 0, -0.02), new THREE.Vector3(hw + 0.14, DIM.backH, -0.02), `${cm(DIM.backH)} high`, new THREE.Vector3(0.05, 0, 0));
  dimLine(new THREE.Vector3(hw - 0.5, 0, DIM.depth + 0.06), new THREE.Vector3(hw - 0.5, DIM.seatH, DIM.depth + 0.06), `${cm(DIM.seatH)} seat`, new THREE.Vector3(0.05, 0, 0));
  const bx0 = BED.x0, bx1 = BED.x1;
  dimLine(new THREE.Vector3(bx0, DIM.seatH + 0.03, DIM.chaiseDepth + 0.02), new THREE.Vector3(bx1, DIM.seatH + 0.03, DIM.chaiseDepth + 0.02), `bed ${cm(bx1 - bx0)} × ${cm(DIM.chaiseDepth - DIM.backCushFrontZ)}`, new THREE.Vector3(0, 0.03, 0));
  dimDefs[dimDefs.length - 1].bed = true;
  // room planning: walkway, TV distance, clearances (dashed-feel: drawn at floor level)
  const R = PLAN.room, kz = (PLAN.east[0].z0 + PLAN.east[0].z1) / 2;
  dimLine(new THREE.Vector3(hw, 0.03, kz), new THREE.Vector3(R.x1, 0.03, kz), `${cm(R.x1 - hw)} walkway to kitchen`, new THREE.Vector3(0, 0, 0.05));
  dimLine(new THREE.Vector3(R.x0, 0.03, R.z1 - 0.06), new THREE.Vector3(R.x1, 0.03, R.z1 - 0.06), `${cm(VR.w)} room`, new THREE.Vector3(0, 0, 0.05));
  dimLine(new THREE.Vector3(R.x1 - 0.06, 0.03, R.z0), new THREE.Vector3(R.x1 - 0.06, 0.03, R.z1), `${cm(VR.d)} room`, new THREE.Vector3(0.05, 0, 0));
  const eyeZ = EYE_Z, tvZ = R.z1 - 0.055, xr = baseX.reclinerA - SOFA_W / 2 + DIM.W.recliner / 2;
  dimLine(new THREE.Vector3(xr, VR.tv.cy, eyeZ), new THREE.Vector3(xr, VR.tv.cy, tvZ), `${(tvZ - eyeZ).toFixed(1)} m eyes → 75" TV`, new THREE.Vector3(0, 0.04, 0));
  const xc = -hw + DIM.W.chaise * 0.55, unitZ = R.z1 - VR.unit.d;
  dimLine(new THREE.Vector3(xc, 0.03, DIM.chaiseDepth), new THREE.Vector3(xc, 0.03, unitZ), `${cm(unitZ - DIM.chaiseDepth)} chaise → TV unit`, new THREE.Vector3(0.05, 0, 0));
  const xb = baseX.reclinerB - SOFA_W / 2 + DIM.W.recliner / 2;
  dimLine(new THREE.Vector3(xb, 0.03, FOOTREST_Z), new THREE.Vector3(xb, 0.03, unitZ), `${cm(unitZ - FOOTREST_Z)} footrest → TV unit`, new THREE.Vector3(0.05, 0, 0));
}
buildDims();
function updateDimLabels() {
  const on = dims.visible && !rig.trans;
  dimLabels.style.display = on ? '' : 'none';
  if (!on) return;
  const W = stage.clientWidth, H = stage.clientHeight;
  const bedOut = A('bedseat', 'bed').value > 0.95;
  for (const d of dimDefs) {
    const vis = !d.bed || bedOut;
    d.line.visible = vis;
    tmpV.copy(d.at).project(camera);
    const hidden = !vis || tmpV.z > 1 || tmpV.z < -1;
    d.el.style.visibility = hidden ? 'hidden' : 'visible';
    d.el.style.transform = `translate(${((tmpV.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-tmpV.y * 0.5 + 0.5) * H).toFixed(1)}px) translate(-50%, -50%)`;
  }
}

// ---------------------------------------------------------------------------
// Bedding (appears on the made-up bed)
// ---------------------------------------------------------------------------
const linen = new THREE.MeshPhysicalMaterial({ color: '#f3f0ea', roughness: 0.95, sheen: 0.3, sheenColor: new THREE.Color('#ffffff') });
const bedding = new THREE.Group();
{
  const duvet = new THREE.Mesh(softBox(1.34, 0.07, 1.30, { r: 0.035, puff: 0.025, bulge: 0.01 }), M.throw);
  duvet.position.set(1.02, DIM.seatH + 0.04, 1.03);
  duvet.rotation.y = 0.02;
  const fold = new THREE.Mesh(softBox(0.24, 0.05, 1.32, { r: 0.025, puff: 0.012 }), linen);
  fold.position.set(0.46, DIM.seatH + 0.065, 1.03);
  const p1 = new THREE.Mesh(softBox(0.36, 0.13, 0.56, { r: 0.06, puff: 0.03, puffBottom: 0.01, bulge: 0.012 }), linen);
  p1.position.set(0.22, DIM.seatH + 0.075, 0.72); p1.rotation.set(0, 0.06, -0.12);
  const p2 = p1.clone(); p2.position.set(0.23, DIM.seatH + 0.075, 1.32); p2.rotation.set(0, -0.05, -0.12);
  for (const m of [duvet, fold, p1, p2]) { m.castShadow = true; m.receiveShadow = true; bedding.add(m); }
  bedding.visible = false;
  scene.add(bedding);
}
let beddingT = 0;
function tickBedding(dt) {
  const want = $('#tg-bedding').checked && A('bedseat', 'bed').value > 0.98 && A('sofa', 'explode').value < 0.01 && view.mode === 'finished';
  beddingT = clamp01(beddingT + (want ? dt : -dt) * 3);
  bedding.visible = beddingT > 0;
  // the bed spans from the chaise's inner edge across the single seat
  // the duvet & pillows were laid out for a 1.73 m bed; stretch them to this size's bed
  const k = (BED.x1 - BED.x0) / 1.73, e = 0.96 + 0.04 * smooth(beddingT);
  bedding.position.set(mods.chaise.group.position.x + 0.16 * k, (1 - smooth(beddingT)) * 0.35, 0);
  bedding.scale.set(e * k, e, e);
  syncRoomPillows();
}
function syncRoomPillows() {
  if (!room) return;
  const bedMade = $('#tg-bedding').checked && A('bedseat', 'bed').value > 0.5;
  const v = $('#tg-pillows').checked && view.mode === 'finished' && !bedMade && A('sofa', 'explode').value < 0.01 && A('chaise', 'storage').value < 0.02;
  if (room._pillows !== v) { room._pillows = v; try { room.set('pillows', v ? 1 : 0); } catch (e) { console.error(e); } }
}

// ---------------------------------------------------------------------------
// Light moods
// ---------------------------------------------------------------------------
let mood = 'day';
function setMood(m) {
  mood = m;
  const ev = m === 'evening';
  sun.intensity = ev ? 0.22 : 2.4;
  sun.color.set(ev ? '#8fa6d4' : '#fff1de');
  hemi.intensity = ev ? 0.2 : 0.85;
  hemi.color.set(ev ? '#d9c2a5' : '#fff8ee');
  fill.intensity = ev ? 0.04 : 0.45;
  scene.environmentIntensity = ev ? 0.14 : 0.5;
  scene.background.set(ev ? '#22201d' : '#e6e1d8');
  renderer.toneMappingExposure = ev ? 1.1 : 0.92;
  for (const l of room?.lights || []) l.intensity = (l.userData.baseIntensity || 1) * (ev ? 4 : 1);
  M.led.emissiveIntensity = ev ? 3.2 : 1.6;
  facing.screenMat.emissiveIntensity = ev ? 0.85 : 0;
  $('#brand').classList.toggle('dark-scene', ev);
  $$('[data-mood]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mood === m)));
}

// ---------------------------------------------------------------------------
// Look (colours)
// ---------------------------------------------------------------------------
const ACCENTS = [
  { name: 'Clay', hex: '#b7856a' }, { name: 'Snow', hex: '#ebe6dc' }, { name: 'Ochre', hex: '#c39d58' },
  { name: 'Dusty blue', hex: '#8b9eac' }, { name: 'Moss', hex: '#737a5c' }, { name: 'Heather', hex: '#c4a7a0' }, { name: 'Oat', hex: '#d6c8b1' },
];
const FLOORS = [{ key: 'stone', name: 'Light stone' }, { key: 'oak', name: 'White oak' }];
const DEFAULT_LOOK = { curated: 'hygge', fabric: 'havre', type: 'chenille', legs: 'gunmetal', accent: '#b7856a', throw: '#ebe6dc', wall: 'kalk', floor: 'stone' };
const look = { ...DEFAULT_LOOK, ...store.get('look', {}) };
function applyLook(save = true) {
  setFabricType(look.type);
  setFabricColour((FABRIC_COLOURS.find((f) => f.key === look.fabric) || FABRIC_COLOURS[0]).hex);
  setLegFinish(look.legs);
  setAccentColour(look.accent);
  setThrowColour(look.throw);
  const wallHex = (WALL_COLOURS.find((w) => w.key === look.wall) || WALL_COLOURS[0]).hex;
  facing.wallMat.color.set(wallHex);
  if (room) {
    try { room.set('wall', wallHex); } catch (e) { console.error(e); }
    try { room.set('floor', look.floor); } catch (e) { console.error(e); }
  }
  if (save) store.set('look', look);
  syncColourUI();
}
function applyCurated(key) {
  const c = CURATED.find((x) => x.key === key);
  if (!c) return;
  Object.assign(look, { curated: key, fabric: c.fabric, type: c.type, legs: c.legs, accent: c.accent, throw: c.throw, wall: c.wall });
  applyLook();
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const kid of kids) if (kid != null) e.append(kid);
  return e;
}

// tabs
const tabBtns = $$('.tabs [data-tab]');
function selectTab(name) {
  tabBtns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  $$('section[data-tab]').forEach((s) => { s.hidden = s.dataset.tab !== name; });
  $('#panel').classList.remove('collapsed');
  store.set('tab', name);
  queueResize();
}
tabBtns.forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));
$('#sheet-handle').addEventListener('click', () => { $('#panel').classList.toggle('collapsed'); queueResize(); });

// hold buttons (UI)
$$('[data-hold]').forEach((b) => bindHold(b, () => b.dataset.hold));
function bindHold(b, idFn) {
  let h = null;
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('pressing'); h = press(idFn()); syncMotionUI(); });
  const up = () => { if (!b.classList.contains('pressing')) return; b.classList.remove('pressing'); release(h); h = null; };
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press(idFn()); syncMotionUI(); } });
}
// sliders scrub instantly
for (const [mod, param] of [['reclinerA', 'recline'], ['reclinerA', 'head'], ['reclinerB', 'recline'], ['reclinerB', 'head'], ['bedseat', 'bed']]) {
  const r = $(`#rng-${mod}-${param}`);
  r.addEventListener('input', () => { jump(mod, param, r.value / 100); syncMotionUI(); });
}
$$('[data-toggle]').forEach((t) => t.addEventListener('change', () => {
  const [mod, param] = t.dataset.toggle.split(':');
  setTarget(mod, param, t.checked ? 1 : 0);
}));
const exRange = $('#rng-explode');
exRange.addEventListener('input', () => { jump('sofa', 'explode', exRange.value / 100); syncMotionUI(); });

$('#preset-movie').addEventListener('click', () => {
  for (const r of ['reclinerA', 'reclinerB']) { setTarget(r, 'recline', 1); setTarget(r, 'head', 0.6); }
  setTarget('console', 'cups', 1);
  setTarget('bedseat', 'bed', 0);
  setMood('evening');
  syncMotionUI();
});
$('#preset-guest').addEventListener('click', () => {
  for (const r of ['reclinerA', 'reclinerB']) { setTarget(r, 'recline', 0); setTarget(r, 'head', 0); }
  setTarget('chaise', 'storage', 0); setTarget('chaise', 'head', 0); setTarget('bedseat', 'head', 0);
  setTarget('bedseat', 'bed', 1);
  $('#tg-bedding').checked = true;
  syncMotionUI();
});
$('#preset-tidy').addEventListener('click', () => {
  for (const a of Object.values(anim)) if (a.mod !== 'sofa') a.target = 0;
  for (const k of ['reclinerA', 'reclinerB', 'bedseat', 'chaise', 'console']) for (const p of Object.keys(mods[k].params || {})) if (p !== 'explode') setTarget(k, p, 0);
  setTarget('sofa', 'explode', 0);
  setMood('day');
  syncMotionUI();
});

function fmtPct(v) { return `${Math.round(v * 100)}%`; }
function syncMotionUI() {
  for (const r of ['reclinerA', 'reclinerB']) {
    const a = A(r, 'recline'), hd = A(r, 'head');
    $(`#rng-${r}-recline`).value = Math.round(a.value * 100);
    $(`#rng-${r}-head`).value = Math.round(hd.value * 100);
    const val = $(`#val-${r}`);
    const moving = a.value !== a.target;
    val.textContent = moving ? (a.target > a.value ? `Reclining · ${fmtPct(a.value)}` : `Returning · ${fmtPct(a.value)}`)
      : a.value <= 0.001 ? 'Upright' : a.value >= 0.999 ? 'Fully reclined' : `Reclined ${fmtPct(a.value)}`;
    val.classList.toggle('on', a.value > 0.001);
  }
  const b = A('bedseat', 'bed');
  $('#rng-bedseat-bed').value = Math.round(b.value * 100);
  const bv = $('#val-bedseat');
  bv.textContent = b.value !== b.target ? (b.target > b.value ? `Pulling out · ${fmtPct(b.value)}` : `Folding · ${fmtPct(b.value)}`)
    : b.value <= 0.001 ? 'Folded away' : b.value >= 0.999 ? 'Bed ready' : `Out ${fmtPct(b.value)}`;
  bv.classList.toggle('on', b.value > 0.001);
  $$('[data-toggle]').forEach((t) => { const [m, p] = t.dataset.toggle.split(':'); t.checked = A(m, p).target > 0.5; });
  const ex = A('sofa', 'explode');
  exRange.value = Math.round(ex.value * 100);
  $('#val-explode').textContent = fmtPct(ex.value);
  renderHudState();
}

// view tab
$$('[data-view]').forEach((b) => b.addEventListener('click', () => {
  const v = b.dataset.view;
  if (v === 'sit') setView('sit', { seat: rig.seat });
  else if (v === 'stand') setView('stand', { spot: rig.spot || 'tv' });
  else setView('orbit');
}));
function choiceGrid(container, entries, onPick) {
  container.innerHTML = '';
  for (const [key, e] of entries) {
    container.append(el('button', { class: 'choice', 'data-key': key, 'aria-pressed': 'false', onclick: () => onPick(key) }, el('b', {}, e.label), el('span', {}, e.note)));
  }
}
choiceGrid($('#orbit-shots'), Object.entries(ORBIT_SHOTS), (k) => setView('orbit', { shot: k }));
choiceGrid($('#stand-spots'), Object.entries(STAND_SPOTS), (k) => setView('stand', { spot: k }));
choiceGrid($('#sit-seats'), SEAT_ORDER.filter((k) => seatAnchor(k)).map((k) => [k, { label: seatAnchor(k).label || k, note: SEAT_NOTES[k] }]), (k) => setView('sit', { seat: k }));
function syncViewUI() {
  $$('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === rig.mode)));
  $('#opts-orbit').hidden = rig.mode !== 'orbit';
  $('#opts-stand').hidden = rig.mode !== 'stand';
  $('#opts-sit').hidden = rig.mode !== 'sit';
  $$('#stand-spots .choice').forEach((c) => c.setAttribute('aria-pressed', String(rig.mode === 'stand' && c.dataset.key === rig.spot)));
  $$('#sit-seats .choice').forEach((c) => c.setAttribute('aria-pressed', String(rig.mode === 'sit' && c.dataset.key === rig.seat)));
}
$$('[data-mood]').forEach((b) => b.addEventListener('click', () => setMood(b.dataset.mood)));
$('#tg-dims').addEventListener('change', (e) => { dims.visible = e.target.checked; });
$('#tg-decor').addEventListener('change', (e) => { try { room?.set('decor', e.target.checked ? 1 : 0); } catch (err) { console.error(err); } });
$('#tg-pillows').addEventListener('change', syncRoomPillows);
$('#tg-bedding').addEventListener('change', syncRoomPillows);
$$('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

// HUD (sit / stand)
const hud = $('#hud');
function renderHud() {
  hud.innerHTML = '';
  if (rig.mode === 'orbit') { hud.hidden = true; return; }
  hud.hidden = false;
  if (rig.mode === 'sit') {
    const s = seatAnchor(rig.seat);
    hud.append(el('span', { class: 'where' }, 'Sitting in ', el('b', {}, s?.label || rig.seat)));
    if (rig.seat.startsWith('recliner')) {
      const up = el('button', { class: 'btn', type: 'button' }, 'Upright');
      const rec = el('button', { class: 'btn primary', type: 'button' }, 'Recline');
      const head = el('button', { class: 'btn', type: 'button', id: 'hud-head' }, 'Headrest');
      bindHold(up, () => `${rig.seat}:recline:-`);
      bindHold(rec, () => `${rig.seat}:recline:+`);
      head.addEventListener('click', () => toggleTo(rig.seat, 'head'));
      hud.append(up, rec, head);
    } else {
      const head = el('button', { class: 'btn', type: 'button', id: 'hud-head' }, 'Tilt headrest');
      head.addEventListener('click', () => toggleTo(rig.seat, 'head'));
      hud.append(head);
      if (rig.seat === 'bedseat') {
        const bed = el('button', { class: 'btn', type: 'button', id: 'hud-bed' }, 'Pull-out bed');
        bed.addEventListener('click', () => toggleTo('bedseat', 'bed'));
        hud.append(bed);
      }
    }
    const next = el('button', { class: 'btn', type: 'button' }, 'Next seat');
    next.addEventListener('click', () => {
      const avail = SEAT_ORDER.filter((k) => seatAnchor(k));
      setView('sit', { seat: avail[(avail.indexOf(rig.seat) + 1) % avail.length] });
    });
    const stand = el('button', { class: 'btn', type: 'button' }, 'Stand up');
    stand.addEventListener('click', () => setView('stand', { spot: 'tv' }));
    hud.append(next, stand);
  } else {
    const pad = el('div', { class: 'pad', 'aria-label': 'Walk' });
    for (const [k, g, lbl] of [['f', '↑', 'Walk forward'], ['l', '←', 'Step left'], ['b', '↓', 'Walk back'], ['r', '→', 'Step right']]) {
      const b = el('button', { class: 'btn', type: 'button', 'data-walk': k, 'aria-label': lbl }, g);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); walkPad.add(k); });
      const up = () => walkPad.delete(k);
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      pad.append(b);
    }
    hud.append(pad, el('span', { class: 'where' }, 'Standing · drag to look'));
    const sit = el('button', { class: 'btn primary', type: 'button' }, 'Sit down');
    sit.addEventListener('click', () => setView('sit', { seat: rig.seat }));
    const back = el('button', { class: 'btn', type: 'button' }, 'Orbit view');
    back.addEventListener('click', () => setView('orbit'));
    hud.append(sit, back);
  }
  renderHudState();
  queueResize();
}
function renderHudState() {
  const h = $('#hud-head');
  if (h) h.setAttribute('aria-pressed', String(A(rig.seat, 'head').target > 0.5));
  const b = $('#hud-bed');
  if (b) b.setAttribute('aria-pressed', String(A('bedseat', 'bed').target > 0.5));
}

// colour tab
function syncColourUI() {
  $$('#curated .cur').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === look.curated)));
  $$('#fabric-swatches .sw').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === look.fabric)));
  const f = FABRIC_COLOURS.find((x) => x.key === look.fabric);
  $('#fabric-name').innerHTML = '';
  if (f) $('#fabric-name').append(el('b', {}, f.name), ` · ${f.note} · ${FABRIC_TYPES.find((t) => t.key === look.type)?.name || ''}`);
  $$('#fabric-types .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === look.type)));
  $$('#leg-finishes .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === look.legs)));
  $$('#accent-colours .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === look.accent)));
  $$('#wall-colours .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === look.wall)));
  $$('#floor-types .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === look.floor)));
}
function buildColourUI() {
  const hexOf = (k) => (FABRIC_COLOURS.find((f) => f.key === k) || {}).hex;
  const wallHex = (k) => (WALL_COLOURS.find((w) => w.key === k) || {}).hex;
  const legHex = (k) => (LEG_FINISHES.find((w) => w.key === k) || {}).hex;
  for (const c of CURATED) {
    $('#curated').append(el('button', { class: 'cur', type: 'button', 'data-key': c.key, 'aria-pressed': 'false', onclick: () => applyCurated(c.key) },
      el('span', { class: 'dots' }, ...[hexOf(c.fabric), c.accent, legHex(c.legs), wallHex(c.wall)].map((h) => el('i', { style: `background:${h}` }))),
      el('b', {}, c.name)));
  }
  for (const f of FABRIC_COLOURS) {
    $('#fabric-swatches').append(el('button', { class: 'sw', type: 'button', 'data-key': f.key, title: `${f.name} · ${f.note}`, 'aria-label': `${f.name}, ${f.note}`, 'aria-pressed': 'false', style: `background:${f.hex}`,
      onclick: () => { look.fabric = f.key; look.curated = null; applyLook(); } }));
  }
  for (const t of FABRIC_TYPES) {
    $('#fabric-types').append(el('button', { class: 'chip noswatch', type: 'button', 'data-key': t.key, 'aria-pressed': 'false', onclick: () => { look.type = t.key; look.curated = null; applyLook(); } }, t.name));
  }
  for (const l of LEG_FINISHES) {
    $('#leg-finishes').append(el('button', { class: 'chip', type: 'button', 'data-key': l.key, 'aria-pressed': 'false', onclick: () => { look.legs = l.key; look.curated = null; applyLook(); } }, el('i', { style: `background:${l.hex}` }), l.name));
  }
  for (const a of ACCENTS) {
    $('#accent-colours').append(el('button', { class: 'chip', type: 'button', 'data-key': a.hex, 'aria-pressed': 'false', onclick: () => { look.accent = a.hex; look.curated = null; applyLook(); } }, el('i', { style: `background:${a.hex}` }), a.name));
  }
  for (const w of WALL_COLOURS) {
    $('#wall-colours').append(el('button', { class: 'chip', type: 'button', 'data-key': w.key, 'aria-pressed': 'false', onclick: () => { look.wall = w.key; look.curated = null; applyLook(); } }, el('i', { style: `background:${w.hex}` }), w.name));
  }
  for (const f of FLOORS) {
    $('#floor-types').append(el('button', { class: 'chip noswatch', type: 'button', 'data-key': f.key, 'aria-pressed': 'false', onclick: () => { look.floor = f.key; applyLook(); } }, f.name));
  }
}
buildColourUI();

// room plan card
{
  const cm = (m) => `${Math.round(m * 100)} cm`;
  const tot = (k) => Object.entries(SIZES[k].W).reduce((a, [n, w]) => a + w * (n === 'recliner' ? 2 : 1), 0);
  $('#size-fit').textContent = cm(tot('fit'));
  $('#size-pictured').textContent = cm(tot('pictured'));
  $$('[data-size]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.size === sizeKey));
    b.addEventListener('click', () => {
      if (b.dataset.size === sizeKey) return;
      store.set('size', b.dataset.size);
      store.set('tab', 'view');
      location.reload();
    });
  });
  const R = PLAN.room, walk = R.x1 - SOFA_W / 2, unitZ = R.z1 - VR.unit.d;
  const rows = [
    ['Walkway to kitchen', `${cm(walk)}${walk < 0.9 ? ' · tight' : ''}`],
    ['Eyes to 75" TV', `${(R.z1 - 0.055 - EYE_Z).toFixed(1)} m · good for 4K`],
    ['Chaise to TV unit', cm(unitZ - DIM.chaiseDepth)],
    ['Footrests to TV unit', cm(unitZ - FOOTREST_Z)],
    ['Pull-out bed', `${cm(BED.x1 - BED.x0)} × ${cm(DIM.chaiseDepth - DIM.backCushFrontZ)}`],
    ['Off the walls', `${cm(VR.wallGap)} back · ${cm(VR.windowGap)} window`],
  ];
  const dl = $('#plan-specs');
  for (const [k, v] of rows) dl.append(el('dt', {}, k), el('dd', {}, v));
  $('#plan-note').textContent = sizeKey === 'fit'
    ? 'Sofa on the 4.59 m wall, chaise at the window end. The TV hangs centred on the sofa on the bedroom wall, 108 cm to its centre, over a floating unit. A 60 cm round table sits beside the chaise and rolls aside when the bed comes out.'
    : 'At the pictured size the sofa’s end comes within about 75 cm of the kitchen opening, so the walk from the hall to the kitchen gets tight. Room-fit trims the chaise, single seat and arm to fix that.';
  $('#show-plan').addEventListener('click', () => {
    $('#tg-dims').checked = true; dims.visible = true;
    setView('orbit', { shot: 'plan' });
  });
}

// brand line with the real numbers
$('#brand-sub').textContent = `${Math.round(SOFA_W * 100)} × ${Math.round(DIM.chaiseDepth * 100)} cm · chaise · single seat with pull-out bed · console · 2 power recliners`;

// ---------------------------------------------------------------------------
// Resize (keeps the sofa centred in the space the panel leaves free)
// ---------------------------------------------------------------------------
let resizeQueued = false;
function queueResize() { if (!resizeQueued) { resizeQueued = true; requestAnimationFrame(() => { resizeQueued = false; resize(); }); } }
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  const panel = $('#panel');
  const mobile = innerWidth <= 760;
  const px = !mobile ? panel.offsetWidth + 16 : 0;
  const py = mobile ? panel.offsetHeight : 0;
  // the full frustum is the canvas plus the panel's share; we render the uncovered window
  camera.aspect = (w + px) / (h + py);
  if (px || py) camera.setViewOffset(w + px, h + py, px, py, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
new ResizeObserver(queueResize).observe(stage);
new ResizeObserver(queueResize).observe($('#panel'));

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
function fatal(msg) {
  const d = document.createElement('div');
  d.id = 'fatal';
  d.textContent = msg;
  document.getElementById('app').append(d);
  document.getElementById('loading')?.classList.add('done');
}

applyLook(false);
setMood('day');
syncMotionUI();
syncViewUI();
selectTab(store.get('tab', 'move'));
if (innerWidth <= 760) $('#panel').classList.add('collapsed');
if (buildErrors.length) console.warn('Placeholders used for', buildErrors);

// dev/test hooks: ?view=sit&seat=reclinerB&rA=1&rB=.5&hA=1&bed=1&lid=1&cups=1&storage=1&explode=.5&mode=xray&pal=cabin&spot=corner&shot=front&dims=1&mood=evening&tab=colour&ui=0
{
  const n = (k) => (Q.has(k) ? parseFloat(Q.get(k)) : null);
  const J = [['rA', 'reclinerA', 'recline'], ['rB', 'reclinerB', 'recline'], ['hA', 'reclinerA', 'head'], ['hB', 'reclinerB', 'head'], ['bed', 'bedseat', 'bed'],
    ['lid', 'console', 'lid'], ['cups', 'console', 'cups'], ['storage', 'chaise', 'storage'], ['hC', 'chaise', 'head'], ['hS', 'bedseat', 'head'], ['explode', 'sofa', 'explode']];
  for (const [q, m, p] of J) if (n(q) != null) jump(m, p, n(q));
  if (Q.get('mode')) setMode(Q.get('mode'));
  if (Q.get('pal')) applyCurated(Q.get('pal'));
  if (Q.get('fabric')) { look.fabric = Q.get('fabric'); applyLook(false); }
  if (Q.get('type')) { look.type = Q.get('type'); applyLook(false); }
  if (Q.get('mood')) setMood(Q.get('mood'));
  if (Q.get('dims') === '1') { $('#tg-dims').checked = true; dims.visible = true; }
  if (Q.get('tab')) selectTab(Q.get('tab'));
  if (Q.get('ui') === '0') { $('#panel').style.display = 'none'; $('#brand').style.display = 'none'; }
  if (Q.get('hs') === '0') $('#tg-hotspots').checked = false;
  const v = Q.get('view');
  if (v) {
    setView(v, { seat: Q.get('seat') || undefined, spot: Q.get('spot') || undefined, shot: Q.get('shot') || undefined });
    if (rig.trans) rig.trans.t = 1;
  } else if (Q.get('shot')) { setView('orbit', { shot: Q.get('shot') }); rig.trans.t = 1; }
  syncMotionUI();
}

resize();
const clock = new THREE.Clock();
let frames = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  tickAnims(dt);
  tickWalk(dt);
  tickBedding(dt);
  updateCamera(dt);
  syncFacing();
  if (hoverDirty) doHover();
  updateHotspots();
  updateDimLabels();
  renderer.render(scene, camera);
  if (++frames === 2) {
    $('#loading').classList.add('done');
    document.title = document.title.replace(/^\[.*?\] /, '');
    document.documentElement.dataset.ready = '1';
  }
});

// debugging handle
window.__sofa = { mods, room, anim, A, setTarget, jump, setView, setMode, rig, camera, scene, renderer };
