// core.js — shared dimensions, geometry helpers and the view-mode switch.
// Every sofa module builds with these so the pieces read as one sofa.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { M } from './materials.js';

// ---------------------------------------------------------------------------
// Dimensions (metres). Module-local frame: x=0 at the module's LEFT edge (as
// seen from the front), y=0 floor, z=0 the sofa's BACK face, +z toward the
// front. Every module's group uses this frame.
// ---------------------------------------------------------------------------
export const DIM = {
  legH: 0.13,          // floor → underside of the base box
  baseTop: 0.28,       // top of base box = underside of seat cushions
  seatH: 0.45,         // top of seat cushions (sitting height)
  armH: 0.62,          // top of arms and of the console's front block
  backShellTop: 0.90,  // top of the outer back panel
  backH: 0.98,         // top of the back cushions
  depth: 1.02,         // standard module depth (seat front at z=1.02)
  baseFront: 1.00,     // front face of base box (seat cushion overhangs to 1.02)
  backShellT: 0.15,    // outer back panel: z 0 → 0.15
  backCushT: 0.17,     // back cushion thickness
  backLean: THREE.MathUtils.degToRad(9), // back cushions lean back 9° from vertical
  backCushFrontZ: 0.32,// back cushion front face where it meets the seat (at y=seatH)
  headSeamY: 0.76,     // horizontal seam between lumbar and headrest sections
  cushionGap: 0.012,   // visual gap between adjacent cushions / modules
  chaiseDepth: 1.72,
  W: { chaise: 1.02, bedseat: 0.88, console: 0.28, recliner: 0.66, arm: 0.22 },
};

// Order along x, left → right as seen from the front.
export const LAYOUT = ['chaise', 'bedseat', 'console', 'reclinerA', 'reclinerB'];

// ---------------------------------------------------------------------------
// Layers drive what each view mode shows.
//   finished : shell, cushion, detail, hard
//   xray     : shell+cushion as ghost, foam, frame, spring, mech, hard
//   frame    : frame, spring, mech, hard
// ---------------------------------------------------------------------------
export const LAYER = {
  SHELL: 'shell',     // upholstered body panels (arms, base box, back panel)
  CUSHION: 'cushion', // seat / back / headrest cushions
  DETAIL: 'detail',   // seams, piping, stitch grooves on upholstery
  FOAM: 'foam',       // foam blocks inside upholstery
  FRAME: 'frame',     // timber / plywood frame
  SPRING: 'spring',   // sinuous springs, elastic webbing
  MECH: 'mech',       // hidden steel mechanisms, motors, rails
  HARD: 'hard',       // always visible: legs, exposed linkage, cup holders, buttons
};

export function part(geo, mat, layer, label, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  m.userData.layer = layer;
  m.userData.cast = m.castShadow;
  if (label) m.userData.label = label;
  return m;
}

export function at(obj, x, y, z) { obj.position.set(x, y, z); return obj; }

// ---------------------------------------------------------------------------
// UVs in metres: planar projection on the dominant normal axis so fabric
// texture density is identical on every piece regardless of size.
// ---------------------------------------------------------------------------
export function worldUV(geo, tile = 0.16) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    let u, v;
    if (nx >= ny && nx >= nz) { u = p.getZ(i); v = p.getY(i); }
    else if (ny >= nx && ny >= nz) { u = p.getX(i); v = p.getZ(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// ---------------------------------------------------------------------------
// softBox: a centred rounded box with dense, edge-weighted tessellation and
// optional pillow crowning. Use it for every upholstered piece.
//   r       corner radius
//   puff    crown height on the +y face (and puffBottom on −y)
//   puffZ   crown on the +z face (front of a back cushion, front of an arm)
//   bulge   outward bulge of the ±x / ±z side walls
//   seg     interior segments [x, y, z]; edgeSeg segments per rounded band
// ---------------------------------------------------------------------------
export function softBox(w, h, d, o = {}) {
  let { r = 0.03, puff = 0, puffBottom = 0, puffZ = 0, bulge = 0, seg, edgeSeg = 4, uvTile = 0.16 } = o;
  r = Math.max(0.001, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const dims = [w, h, d];
  seg = seg || dims.map((s) => Math.max(2, Math.round(s / 0.05)));
  const counts = seg.map((s) => s + edgeSeg * 2);
  const g0 = new THREE.BoxGeometry(2, 2, 2, counts[0], counts[1], counts[2]);
  g0.deleteAttribute('normal');
  g0.deleteAttribute('uv');
  const pos = g0.attributes.position;
  const half = dims.map((s) => s / 2), inner = half.map((s) => s - r);
  const remap = (t, a) => {
    const n = counts[a];
    const i = Math.round(((t + 1) / 2) * n);
    if (i <= edgeSeg) return -half[a] + (i / edgeSeg) * r;
    if (i >= n - edgeSeg) return inner[a] + ((i - (n - edgeSeg)) / edgeSeg) * r;
    return -inner[a] + ((i - edgeSeg) / (n - 2 * edgeSeg)) * 2 * inner[a];
  };
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(remap(pos.getX(i), 0), remap(pos.getY(i), 1), remap(pos.getZ(i), 2));
    c.set(
      THREE.MathUtils.clamp(v.x, -inner[0], inner[0]),
      THREE.MathUtils.clamp(v.y, -inner[1], inner[1]),
      THREE.MathUtils.clamp(v.z, -inner[2], inner[2]),
    );
    const dir = v.clone().sub(c);
    if (dir.lengthSq() > 1e-12) v.copy(c).add(dir.normalize().multiplyScalar(r));
    const fx = Math.max(0, 1 - (v.x / half[0]) ** 2);
    const fy = Math.max(0, 1 - (v.y / half[1]) ** 2);
    const fz = Math.max(0, 1 - (v.z / half[2]) ** 2);
    if (puff && v.y > 0) v.y += puff * Math.pow(v.y / half[1], 3) * fx * fz;
    if (puffBottom && v.y < 0) v.y -= puffBottom * Math.pow(-v.y / half[1], 3) * fx * fz;
    if (puffZ && v.z > 0) v.z += puffZ * Math.pow(v.z / half[2], 3) * fx * fy;
    if (bulge) {
      v.x += Math.sign(v.x) * bulge * Math.pow(Math.abs(v.x) / half[0], 3) * fy * fz;
      v.z += Math.sign(v.z) * bulge * Math.pow(Math.abs(v.z) / half[2], 3) * fx * fy;
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  const g = mergeVertices(g0, 1e-6);
  g.computeVertexNormals();
  worldUV(g, uvTile);
  return g;
}

// Hard rounded box (frame parts, trims). Centred.
export function rbox(w, h, d, r = 0.004, seg = 2) {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2));
}

// Plain box for timber rails. Centred.
export function rail(w, h, d) { return new THREE.BoxGeometry(w, h, d); }

// Thin tube through points (piping, seams, wire). Points are Vector3s.
export function tube(points, radius = 0.004, segs, closed = false, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  return new THREE.TubeGeometry(curve, segs || Math.max(8, points.length * 6), radius, radial, closed);
}

// Straight cylinder between two points (linkage bars, rods, struts).
const _up = new THREE.Vector3(0, 1, 0);
export function rod(a, b, radius = 0.006, mat = M.steel, layer = LAYER.MECH, label) {
  const dir = b.clone().sub(a), len = dir.length();
  const m = part(new THREE.CylinderGeometry(radius, radius, len, 10), mat, layer, label);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(_up, dir.normalize());
  return m;
}
// Re-aim an existing rod mesh between two points (for animated linkages).
// The rod must have been created by rod() (unit-length scaling is applied).
export function aimRod(mesh, a, b) {
  const dir = b.clone().sub(a), len = dir.length();
  const base = mesh.geometry.parameters.height;
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(_up, dir.normalize());
  mesh.scale.set(1, len / base, 1);
}

// Flat linkage bar (rectangular cross-section) between two points in a plane
// of constant x. Used for recliner / scissor links.
export function linkBar(a, b, w = 0.022, t = 0.005, mat = M.steel, layer = LAYER.MECH, label = 'Steel linkage') {
  const m = part(new THREE.BoxGeometry(t, w, 1), mat, layer, label);
  aimBar(m, a, b);
  return m;
}
// a, b are in the bar's PARENT space. For bars lying in a constant-x plane the
// rotation is purely about x, so the bar's thickness stays along x.
const _fwd = new THREE.Vector3(0, 0, 1);
export function aimBar(mesh, a, b) {
  const dir = b.clone().sub(a), len = dir.length();
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.scale.set(1, 1, Math.max(1e-4, len));
  mesh.quaternion.setFromUnitVectors(_fwd, dir.normalize());
}

// Sinuous (S-type) spring running along +z from z=0 to z=len, zig-zagging in x.
export function sinuousSpring(len, amp = 0.022, waves = 9, r = 0.0032) {
  const pts = [];
  const n = waves * 2;
  for (let i = 0; i <= n; i++) {
    const z = (i / n) * len;
    const x = (i === 0 || i === n) ? 0 : (i % 2 ? amp : -amp);
    pts.push(new THREE.Vector3(x, 0, z));
  }
  return tube(pts, r, n * 8, false, 5);
}

// Slim tapered leg with a mounting plate. Origin at the TOP of the leg
// (underside of the base). splayX/splayZ tilt the foot outward (radians).
export function taperedLeg(h = DIM.legH, { top = 0.016, bottom = 0.009, splayX = 0, splayZ = 0, label = 'Metal leg' } = {}) {
  const g = new THREE.Group();
  const len = h / Math.cos(Math.hypot(splayX, splayZ));
  const leg = part(new THREE.CylinderGeometry(top, bottom, len, 16), M.leg, LAYER.HARD, label);
  leg.position.y = -len / 2;
  const pivot = new THREE.Group();
  pivot.add(leg);
  pivot.rotation.set(splayZ, 0, -splayX);
  const plate = part(new THREE.CylinderGeometry(top * 1.9, top * 1.9, 0.006, 16), M.leg, LAYER.HARD, label);
  plate.position.y = -0.003;
  const glide = part(new THREE.CylinderGeometry(bottom * 1.05, bottom * 1.05, 0.006, 12), M.rubber, LAYER.HARD, 'Floor glide');
  glide.position.y = -len + 0.002;
  pivot.add(glide);
  g.add(plate, pivot);
  return g;
}

// ---------------------------------------------------------------------------
// View modes
// ---------------------------------------------------------------------------
export const MODES = ['finished', 'xray', 'frame'];

export function applyViewMode(root, mode) {
  root.traverse((o) => {
    if (!o.isMesh || !o.userData.layer) return;
    const L = o.userData.layer;
    if (!o.userData.baseMat) o.userData.baseMat = o.material;
    let vis = true, mat = o.userData.baseMat, cast = o.userData.cast ?? true;
    switch (L) {
      case LAYER.SHELL:
      case LAYER.CUSHION:
        vis = mode !== 'frame';
        if (mode === 'xray') { mat = M.ghost; cast = false; }
        break;
      case LAYER.DETAIL: vis = mode === 'finished'; break;
      case LAYER.FOAM: vis = mode === 'xray'; cast = false; break;
      case LAYER.FRAME:
      case LAYER.SPRING:
      case LAYER.MECH: vis = mode !== 'finished'; break;
      default: vis = true;
    }
    if (o.userData.hiddenByState) vis = false;   // modules may hide parts (e.g. cups)
    o.visible = vis;
    o.material = mat;
    o.castShadow = cast;
  });
}

// ---------------------------------------------------------------------------
// Small maths helpers for poses
// ---------------------------------------------------------------------------
export const clamp01 = (t) => Math.min(1, Math.max(0, t));
export const lerp = THREE.MathUtils.lerp;
export const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
// Remap t from [a,b] → [0,1] (clamped, smoothed): handy for staged motions.
export const phase = (t, a, b) => smooth((t - a) / (b - a));
