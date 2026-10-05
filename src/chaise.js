// chaise.js — the divan / chaise longue at the sofa's LEFT end.
//
// Module-local frame (see SPEC.md): x 0 → 1.02 (left → right), y up, z 0 (back)
// → 1.72 (front of the chaise).
//
//   • Low outer arm on the left (x 0 → 0.17, back → z 1.155) with a plush padded
//     bolster on top whose rounded end overhangs the arm front, like the photo.
//   • Tapered outer back panel and a leaning back cushion over the seating
//     width (lumbar + headrest roll split at y≈0.76). The headrest roll tilts
//     forward on two ratchet hinges about the seam's front edge (param `head`).
//   • Long seat cushion (x 0.18 → 1.01, z 0.35 → 1.72) + a corner cushion in
//     front of the arm end, so the front of the chaise is full width.
//   • Lift-up storage (param `storage`): the seat deck with its cushion rises on
//     a pair of four-bar "ottoman" lift linkages and two gas struts. The linkage
//     is real kinematics (circle–circle solve), synthesised so the deck pivots
//     about a virtual point near the cushion's top-rear corner: the front rises
//     to ~50° while the cushion's back edge rolls forward, clear of the back
//     cushion. Underneath is a felt-lined storage well.
//   • Internals: hardwood base / arm / back frames, corner blocks, plywood arm and
//     back panels, sinuous springs on the deck, elastic webbing on the back,
//     foam & fibre in every cushion.
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DIM, LAYER, part, at, softBox, rbox, rail, tube, worldUV, taperedLeg, clamp01 } from './core.js';
import { M } from './materials.js';

const D2R = Math.PI / 180;
const W = DIM.W.chaise;            // 1.02
const Y_BOT = DIM.legH;            // 0.13 underside of the base
const Y_TOP = DIM.baseTop;         // 0.28 top of the base / underside of cushions
const LEAN = DIM.backLean;         // 9°
const TAN_LEAN = Math.tan(LEAN);

// ---- plan layout ---------------------------------------------------------
const ARM_X0 = 0.010;              // arm body outer face
const ARM_X1 = 0.166;              // arm body inner face
const ARM_Z1 = 1.155;              // arm body front face
const HOLE = { x0: 0.21, x1: 0.97, z0: 0.365, z1: 1.65 };   // storage well (inside faces)
const SEAT = { x0: 0.186, x1: 1.016, z0: 0.365, z1: 1.72, y0: 0.276, h: 0.170 };
const CORNER = { x0: 0.012, x1: 0.178, z0: 1.165 };
const DECK = { x0: 0.25, x1: 0.93, z0: 0.37, z1: 1.645, y0: 0.205, y1: 0.28 };
const MIRROR_X = HOLE.x0 + HOLE.x1;      // mirror plane for the right-hand mechanism

// ---- back cushion lean frame --------------------------------------------
// Group origin = bottom-rear edge of the back cushion; local +y runs up the
// cushion, local +z (w) points out of its front face.
const BACK_O = { y: 0.285, z: 0.168 };
const BACK_T = DIM.backCushT;            // 0.17
const SEAM_V = 0.454;                    // lumbar / headrest split (front seam at y≈0.76)
const TOP_V = 0.678;                     // top of the headrest roll (front-top at y≈0.98)
const HEAD_PIVOT_W = 0.15;               // ratchet axis just behind the seam's front edge
const HEAD_MAX = 25 * D2R;

// ---- lift-up four-bar linkage (y, z) in the closed pose -------------------
// A0/B0: ground pivots on the base brackets. A1/B1: pivots on the deck bracket.
const LNK = { A0: [0.165, 0.953], A1: [0.255, 0.540], B0: [0.165, 0.556], B1: [0.244, 0.413] };
const LIFT_MAX = 50 * D2R;               // deck tilt when fully open
const STRUT_G = [0.170, 0.620];          // gas strut base eye (ground)
const STRUT_D = [0.200, 1.020];          // gas strut rod eye (on the deck, closed pose)
const STRUT_CYL = 0.32;                  // cylinder length
const STRUT_EYE = 0.012;
// x planes of the left-hand mechanism (mirrored about MIRROR_X on the right)
const PX = { plate: 0.2135, linkA: 0.2175, linkB: 0.2225, strut: 0.2355, deckPlate: 0.248 };

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Box placed by its min/max corners.
function boxAt(x0, y0, z0, x1, y1, z1, mat, layer, label, round = 0) {
  const g = round > 0 ? rbox(x1 - x0, y1 - y0, z1 - z0, round, 2) : rail(x1 - x0, y1 - y0, z1 - z0);
  return at(part(g, mat, layer, label), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

// Re-implements softBox's crowning so seams can be laid exactly on the surface.
function softDeform(w, h, d, o) {
  const { puff = 0, puffBottom = 0, puffZ = 0, bulge = 0 } = o;
  const half = [w / 2, h / 2, d / 2];
  return (p) => {
    const fx = Math.max(0, 1 - (p.x / half[0]) ** 2);
    const fy = Math.max(0, 1 - (p.y / half[1]) ** 2);
    const fz = Math.max(0, 1 - (p.z / half[2]) ** 2);
    if (puff && p.y > 0) p.y += puff * Math.pow(p.y / half[1], 3) * fx * fz;
    if (puffBottom && p.y < 0) p.y -= puffBottom * Math.pow(-p.y / half[1], 3) * fx * fz;
    if (puffZ && p.z > 0) p.z += puffZ * Math.pow(p.z / half[2], 3) * fx * fy;
    if (bulge) {
      p.x += Math.sign(p.x) * bulge * Math.pow(Math.abs(p.x) / half[0], 3) * fy * fz;
      p.z += Math.sign(p.z) * bulge * Math.pow(Math.abs(p.z) / half[2], 3) * fx * fy;
    }
    return p;
  };
}

// Piping loop around a softBox face, at 45° on its rounded edge.
// face 'top' → loop around the +y face; 'front' → loop around the +z face.
function seamLoop(w, h, d, o, face = 'top', radius = 0.0021) {
  const r = Math.max(0.001, Math.min(o.r ?? 0.03, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const def = softDeform(w, h, d, o);
  const dims = { x: w / 2 - r, y: h / 2 - r, z: d / 2 - r };
  const [ua, ub, uc] = face === 'top' ? ['x', 'z', 'y'] : ['x', 'y', 'z'];
  const ia = dims[ua], ib = dims[ub], ic = dims[uc];
  const c45 = Math.SQRT1_2;
  const pts = [];
  const corners = [[ia, ib, 0], [-ia, ib, Math.PI / 2], [-ia, -ib, Math.PI], [ia, -ib, Math.PI * 1.5]];
  const lenA = 2 * ia, lenB = 2 * ib;
  const push = (a, b, na, nb) => {
    const p = { x: 0, y: 0, z: 0 };
    p[ua] = a + na * r * c45; p[ub] = b + nb * r * c45; p[uc] = ic + r * c45 + 0.0006;
    def(p);
    pts.push(new THREE.Vector3(p.x, p.y, p.z));
  };
  for (let k = 0; k < 4; k++) {
    const [ca, cb, a0] = corners[k];
    for (let i = 0; i <= 6; i++) { const a = a0 + (i / 6) * Math.PI / 2; push(ca, cb, Math.cos(a), Math.sin(a)); }
    // straight run to the next corner
    const [na, nb] = corners[(k + 1) % 4];
    const len = k % 2 === 0 ? lenA : lenB;
    const steps = Math.max(1, Math.round(len / 0.06));
    const nrm = [[0, 1], [-1, 0], [0, -1], [1, 0]][k];
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      push(ca + (na - ca) * t, cb + (nb - cb) * t, nrm[0], nrm[1]);
    }
  }
  return tube(pts, radius, pts.length * 2, true, 5);
}

// Rounded polygon → THREE.Path; pts are [x, z] in plan, emitted as (x, -z).
function roundedPath(path, pts, radii) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const P = pts[i], A = pts[(i - 1 + n) % n], B = pts[(i + 1) % n], r = radii[i] || 0;
    if (r <= 0) { if (i === 0) path.moveTo(P[0], -P[1]); else path.lineTo(P[0], -P[1]); continue; }
    const la = Math.hypot(A[0] - P[0], A[1] - P[1]), lb = Math.hypot(B[0] - P[0], B[1] - P[1]);
    const t1 = [P[0] + (A[0] - P[0]) / la * r, P[1] + (A[1] - P[1]) / la * r];
    const t2 = [P[0] + (B[0] - P[0]) / lb * r, P[1] + (B[1] - P[1]) / lb * r];
    if (i === 0) path.moveTo(t1[0], -t1[1]); else path.lineTo(t1[0], -t1[1]);
    path.quadraticCurveTo(P[0], -P[1], t2[0], -t2[1]);
  }
  path.closePath();
  return path;
}

// Upholstered plinth with a storage opening: an extruded plan with soft
// (bevelled) top and bottom edges. Caps keep flat normals, walls are smoothed.
function trayGeometry(outer, outerR, hole, holeR, y0, y1, bev) {
  const shape = roundedPath(new THREE.Shape(), outer, outerR);
  shape.holes.push(roundedPath(new THREE.Path(), hole, holeR));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: (y1 - y0) - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev,
    bevelSegments: 5, curveSegments: 10, steps: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + bev, 0);
  const sub = (grp) => {
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(g.attributes.position.array.slice(grp.start * 3, (grp.start + grp.count) * 3), 3));
    return out;
  };
  const caps = sub(g.groups[0]);
  caps.computeVertexNormals();
  let sides = mergeVertices(sub(g.groups[1]), 1e-5);
  sides.computeVertexNormals();
  sides = sides.toNonIndexed();
  const merged = mergeGeometries([caps, sides]);
  g.dispose();
  return worldUV(merged);
}

// The outer back panel leans its front face back by the back angle above the
// deck, so the leaning back cushion sits parallel to it.
function leanFront(geo, cy, d, yStart) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + cy;
    const t = Math.max(0, y - yStart) * TAN_LEAN;
    const s = (d - t) / d;
    p.setZ(i, -d / 2 + (p.getZ(i) + d / 2) * s);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return worldUV(geo);
}

// Sinuous spring with a lighter tessellation than the shared helper.
function springGeo(len, amp = 0.024, waves = 20) {
  const pts = [];
  const n = waves * 2;
  for (let i = 0; i <= n; i++) {
    const z = (i / n) * len;
    const x = (i === 0 || i === n) ? 0 : (i % 2 ? amp : -amp);
    pts.push(new THREE.Vector3(x, 0, z));
  }
  return tube(pts, 0.0032, n * 4, false, 5);
}

// Cylinder whose axis runs along x (pins, pivot bosses, hinge knuckles).
function xCyl(r, len, mat, layer, label, segs = 14) {
  const m = part(new THREE.CylinderGeometry(r, r, len, segs), mat, layer, label);
  m.rotation.z = Math.PI / 2;
  return m;
}

// Flat steel link (thickness along x) between two (y,z) points; its local +z
// runs along the bar, so end bosses are children at ±0.5.
function makeLink(x, label) {
  const g = new THREE.Group();
  const bar = part(new THREE.BoxGeometry(0.004, 0.024, 1), M.steel, LAYER.HARD, label);
  g.add(bar);
  g.userData.x = x;
  return { group: g, bar };
}
const _fwd = new THREE.Vector3(0, 0, 1), _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
function aimLink(link, ay, az, by, bz) {
  _a.set(link.group.userData.x, ay, az); _b.set(link.group.userData.x, by, bz);
  _dir.subVectors(_b, _a);
  const len = _dir.length();
  link.bar.position.copy(_a).addScaledVector(_dir, 0.5);
  link.bar.scale.set(1, 1, Math.max(1e-4, len));
  link.bar.quaternion.setFromUnitVectors(_fwd, _dir.normalize());
}

// circle–circle intersection in (y, z); picks the solution nearest `near`
function circleInt(c0y, c0z, r0, c1y, c1z, r1, nearY, nearZ, out) {
  const dy = c1y - c0y, dz = c1z - c0z, d = Math.hypot(dy, dz);
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r0 * r0 - a * a));
  const my = c0y + a * dy / d, mz = c0z + a * dz / d;
  const p1y = my + h * dz / d, p1z = mz - h * dy / d, p2y = my - h * dz / d, p2z = mz + h * dy / d;
  const d1 = (p1y - nearY) ** 2 + (p1z - nearZ) ** 2, d2 = (p2y - nearY) ** 2 + (p2z - nearZ) ** 2;
  if (d1 <= d2) { out[0] = p1y; out[1] = p1z; } else { out[0] = p2y; out[1] = p2z; }
  return out;
}

// ---------------------------------------------------------------------------
export function createChaise() {
  const group = new THREE.Group();
  group.name = 'chaise';
  const params = { storage: 0, head: 0, explode: 0 };
  const controls = [];
  const seats = [];

  // ======================================================================
  // UPHOLSTERED BASE (plinth with the storage opening)
  // ======================================================================
  const bev = 0.014;
  const outer = [
    [0.163 + bev, 0.10 + bev], [W - bev, 0.10 + bev], [W - bev, 1.70 - bev], [ARM_X0 + bev, 1.70 - bev],
    [ARM_X0 + bev, 1.12 + bev], [0.163 + bev, 1.12 + bev],
  ];
  const outerR = [0, 0.03, 0.032, 0.032, 0, 0];
  const hole = [[HOLE.x0 - bev, HOLE.z0 - bev], [HOLE.x1 + bev, HOLE.z0 - bev], [HOLE.x1 + bev, HOLE.z1 + bev], [HOLE.x0 - bev, HOLE.z1 + bev]];
  const trayGeo = trayGeometry(outer, outerR, hole, [0.02, 0.02, 0.02, 0.02], Y_BOT, Y_TOP, bev);
  group.add(part(trayGeo, M.fabric, LAYER.SHELL, 'Upholstered base'));

  // storage well: dust cover underneath, plywood floor, felt lining
  const wellFloorY = 0.1465;
  group.add(boxAt(HOLE.x0, Y_BOT, HOLE.z0, HOLE.x1, Y_BOT + 0.0015, HOLE.z1, M.underside, LAYER.SHELL, 'Black dust cover'));
  group.add(boxAt(HOLE.x0 + 0.001, Y_BOT + 0.0015, HOLE.z0 + 0.001, HOLE.x1 - 0.001, 0.1435, HOLE.z1 - 0.001, M.ply, LAYER.FRAME, 'Plywood storage floor'));
  const feltTop = 0.262;
  group.add(boxAt(HOLE.x0, 0.1435, HOLE.z0, HOLE.x1, wellFloorY, HOLE.z1, M.felt, LAYER.SHELL, 'Felt-lined storage well'));
  group.add(boxAt(HOLE.x0 - 0.0005, wellFloorY, HOLE.z0, HOLE.x0 + 0.0015, feltTop, HOLE.z1, M.felt, LAYER.SHELL, 'Felt-lined storage well'));
  group.add(boxAt(HOLE.x1 - 0.0015, wellFloorY, HOLE.z0, HOLE.x1 + 0.0005, feltTop, HOLE.z1, M.felt, LAYER.SHELL, 'Felt-lined storage well'));
  group.add(boxAt(HOLE.x0, wellFloorY, HOLE.z0 - 0.0005, HOLE.x1, feltTop, HOLE.z0 + 0.0015, M.felt, LAYER.SHELL, 'Felt-lined storage well'));
  group.add(boxAt(HOLE.x0, wellFloorY, HOLE.z1 - 0.0015, HOLE.x1, feltTop, HOLE.z1 + 0.0005, M.felt, LAYER.SHELL, 'Felt-lined storage well'));

  // ======================================================================
  // OUTER BACK PANEL (front face leans back above the deck)
  // ======================================================================
  {
    const h = 0.90 - Y_BOT, d = DIM.backShellT;
    const g = leanFront(softBox(W, h, d, { r: 0.035, bulge: 0.003, seg: [14, 10, 2] }), Y_BOT + h / 2, d, Y_TOP);
    group.add(at(part(g, M.fabric, LAYER.SHELL, 'Outer back panel'), W / 2, Y_BOT + h / 2, d / 2));
  }

  // ======================================================================
  // OUTER ARM + padded bolster
  // ======================================================================
  {
    const ax0 = ARM_X0, ay1 = 0.49, az0 = 0.10;
    const g = softBox(ARM_X1 - ax0, ay1 - Y_BOT, ARM_Z1 - az0, { r: 0.03, bulge: 0.003 });
    group.add(at(part(g, M.fabric, LAYER.SHELL, 'Outer arm'), (ax0 + ARM_X1) / 2, (Y_BOT + ay1) / 2, (az0 + ARM_Z1) / 2));
  }
  const bolster = new THREE.Group();
  group.add(bolster);
  {
    const bx0 = 0.003, bx1 = 0.174, by0 = 0.472, by1 = 0.592, bz0 = 0.09, bz1 = 1.19;
    const o = { r: 0.055, puff: 0.012, puffBottom: 0.0, bulge: 0.003, seg: [3, 2, 20] };
    const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2, cz = (bz0 + bz1) / 2;
    bolster.add(at(part(softBox(bx1 - bx0, by1 - by0, bz1 - bz0, o), M.fabric, LAYER.CUSHION, 'Padded arm bolster'), cx, cy, cz));
    bolster.add(at(part(seamLoop(bx1 - bx0, by1 - by0, bz1 - bz0, o, 'top'), M.seam, LAYER.DETAIL, 'Seam piping'), cx, cy, cz));
    bolster.add(at(part(rbox(0.15, 0.085, 1.05, 0.03), M.fibre, LAYER.FOAM, 'Fibre-wrapped foam bolster'), cx, cy + 0.004, cz - 0.005));
  }

  // ======================================================================
  // CORNER CUSHION (in front of the arm end) — fixed
  // ======================================================================
  const corner = new THREE.Group();
  group.add(corner);
  {
    const w = CORNER.x1 - CORNER.x0, d = SEAT.z1 - CORNER.z0, h = SEAT.h;
    const o = { r: 0.055, puff: 0.006, bulge: 0.003, seg: [3, 3, 9] };
    const cx = (CORNER.x0 + CORNER.x1) / 2, cy = SEAT.y0 + h / 2, cz = (CORNER.z0 + SEAT.z1) / 2;
    corner.add(at(part(softBox(w, h, d, o), M.fabric, LAYER.CUSHION, 'Chaise corner cushion'), cx, cy, cz));
    corner.add(at(part(seamLoop(w, h, d, o, 'top'), M.seam, LAYER.DETAIL, 'Seam piping'), cx, cy, cz));
    corner.add(at(part(rbox(w - 0.03, h - 0.04, d - 0.03, 0.01), M.foam, LAYER.FOAM, 'HR foam 35 kg/m³'), cx, cy - 0.008, cz));
    corner.add(at(part(rbox(w - 0.02, 0.022, d - 0.02, 0.008), M.fibre, LAYER.FOAM, 'Fibre wrap'), cx, cy + h / 2 - 0.02, cz));
  }

  // ======================================================================
  // BACK CUSHION (leaning): lumbar + adjustable headrest roll
  // ======================================================================
  const backG = new THREE.Group();
  backG.rotation.x = -LEAN;
  group.add(backG);
  {
    const x0 = 0.184, x1 = 1.006;
    const o = { r: 0.06, puffZ: 0.03, seg: [14, 8, 3] };
    const w = x1 - x0, h = SEAM_V - 0.002, cx = (x0 + x1) / 2;
    backG.add(at(part(softBox(w, h, BACK_T, o), M.fabric, LAYER.CUSHION, 'Back cushion — lumbar'), cx, h / 2, BACK_T / 2));
    backG.add(at(part(seamLoop(w, h, BACK_T, o, 'front'), M.seam, LAYER.DETAIL, 'Seam piping'), cx, h / 2, BACK_T / 2));
    backG.add(at(part(rbox(w - 0.05, h - 0.05, BACK_T - 0.045, 0.012), M.foam, LAYER.FOAM, 'Back foam 28 kg/m³'), cx, h / 2, BACK_T / 2 - 0.004));
    backG.add(at(part(rbox(w - 0.03, h - 0.03, 0.02, 0.008), M.fibre, LAYER.FOAM, 'Fibre wrap'), cx, h / 2, BACK_T - 0.016));
  }
  // headrest roll on its ratchet pivot
  const headG = new THREE.Group();
  backG.add(headG);
  const headCtl = new THREE.Group();
  headG.add(headCtl);
  {
    const x0 = 0.184, x1 = 1.006, w = x1 - x0, h = TOP_V - SEAM_V - 0.002;
    const o = { r: 0.065, puffZ: 0.02, seg: [14, 3, 3] };
    const cx = (x0 + x1) / 2, cv = SEAM_V + 0.002 + h / 2 - SEAM_V, cw = BACK_T / 2 - HEAD_PIVOT_W;
    headCtl.add(at(part(softBox(w, h, BACK_T, o), M.fabric, LAYER.CUSHION, 'Adjustable headrest roll'), cx, cv, cw));
    headG.add(at(part(seamLoop(w, h, BACK_T, o, 'front'), M.seam, LAYER.DETAIL, 'Seam piping'), cx, cv, cw));
    const roll = part(new THREE.CylinderGeometry(0.075, 0.075, w - 0.05, 20), M.fibre, LAYER.FOAM, 'Fibre-filled headrest roll');
    roll.rotation.z = Math.PI / 2; roll.scale.set(1.0, 1, 1.05);
    headG.add(at(roll, cx, cv, cw));
    // invisible hit volume so the headrest stays clickable in frame view
    const hit = part(new THREE.BoxGeometry(w, h, BACK_T), new THREE.MeshBasicMaterial({ visible: false }), LAYER.HARD, 'Adjustable headrest roll', { cast: false, receive: false });
    headCtl.add(at(hit, cx, cv, cw));
  }
  controls.push({ object: headCtl, id: 'chaise:head:toggle', hint: 'Tilt headrest' });

  // ratchet hinges (two), lower leaf bolted to the back frame
  for (const hx of [0.36, 0.84]) {
    const lower = part(new THREE.BoxGeometry(0.006, 0.026, 1), M.steel, LAYER.MECH, 'Ratchet headrest hinge');
    const la = v3(hx, SEAM_V, HEAD_PIVOT_W), lb = v3(hx, SEAM_V - 0.20, -0.03);
    _dir.subVectors(lb, la);
    lower.scale.z = _dir.length();
    lower.position.copy(la).addScaledVector(_dir, 0.5);
    lower.quaternion.setFromUnitVectors(_fwd, _dir.clone().normalize());
    backG.add(lower);
    backG.add(at(part(rbox(0.03, 0.05, 0.012, 0.003), M.steel, LAYER.MECH, 'Ratchet headrest hinge'), hx, SEAM_V - 0.20, -0.03));
    const disc = xCyl(0.016, 0.014, M.steel, LAYER.MECH, 'Ratchet headrest hinge', 18);
    backG.add(at(disc, hx, SEAM_V, HEAD_PIVOT_W));
    const hub = xCyl(0.006, 0.026, M.chrome, LAYER.MECH, 'Ratchet headrest hinge', 10);
    backG.add(at(hub, hx, SEAM_V, HEAD_PIVOT_W));
    const upper = part(new THREE.BoxGeometry(0.006, 0.024, 1), M.steel, LAYER.MECH, 'Ratchet headrest hinge');
    const ua = v3(hx + 0.008, 0, 0), ub = v3(hx + 0.008, 0.12, -0.085);
    _dir.subVectors(ub, ua);
    upper.scale.z = _dir.length();
    upper.position.copy(ua).addScaledVector(_dir, 0.5);
    upper.quaternion.setFromUnitVectors(_fwd, _dir.clone().normalize());
    headG.add(upper);
  }

  // ======================================================================
  // SEAT DECK (lift-up lid) + cushion
  // ======================================================================
  const deck = new THREE.Group();
  group.add(deck);
  const OY = LNK.A1[0], OZ = LNK.A1[1];          // deck origin = pivot A1 (closed)
  const dAt = (o, x, y, z) => at(o, x, y - OY, z - OZ);
  const dBox2 = (x0, y0, z0, x1, y1, z1, mat, layer, label, round) => {
    const m = boxAt(x0, y0, z0, x1, y1, z1, mat, layer, label, round);
    m.position.y -= OY; m.position.z -= OZ;
    return m;
  };
  {
    const w = DECK.x1 - DECK.x0, h = DECK.y1 - DECK.y0, d = DECK.z1 - DECK.z0;
    deck.add(dAt(part(softBox(w, h, d, { r: 0.012, edgeSeg: 2, seg: [4, 1, 8] }), M.fabric, LAYER.SHELL, 'Upholstered storage lid'),
      (DECK.x0 + DECK.x1) / 2, (DECK.y0 + DECK.y1) / 2, (DECK.z0 + DECK.z1) / 2));
    const under = part(new THREE.PlaneGeometry(w - 0.03, d - 0.03), M.felt, LAYER.SHELL, 'Felt lid lining');
    under.rotation.x = Math.PI / 2;
    deck.add(dAt(under, (DECK.x0 + DECK.x1) / 2, DECK.y0 - 0.0008, (DECK.z0 + DECK.z1) / 2));
    // deck frame
    const ry0 = 0.21, ry1 = 0.275;
    deck.add(dBox2(0.255, ry0, 0.375, 0.28, ry1, 1.64, M.wood, LAYER.FRAME, 'Kiln-dried hardwood frame'));
    deck.add(dBox2(0.90, ry0, 0.375, 0.925, ry1, 1.64, M.wood, LAYER.FRAME, 'Kiln-dried hardwood frame'));
    deck.add(dBox2(0.28, ry0, 1.61, 0.90, ry1, 1.64, M.wood, LAYER.FRAME, 'Kiln-dried hardwood frame'));
    deck.add(dBox2(0.28, ry0, 0.375, 0.90, ry1, 0.405, M.wood, LAYER.FRAME, 'Kiln-dried hardwood frame'));
    deck.add(dBox2(0.28, ry0, 0.99, 0.90, 0.255, 1.02, M.wood, LAYER.FRAME, 'Hardwood cross rail'));
    // sinuous springs front-to-back
    const sg = springGeo(1.205, 0.024, 20);
    for (let i = 0; i < 6; i++) {
      const sx = 0.28 + 0.0517 + i * 0.1033;
      deck.add(dAt(part(sg, M.spring, LAYER.SPRING, 'Sinuous S-springs'), sx, 0.268, 0.405));
      deck.add(dBox2(sx - 0.012, 0.268, 0.385, sx + 0.012, 0.279, 0.405, M.steel, LAYER.SPRING, 'Spring clip', 0.002));
      deck.add(dBox2(sx - 0.012, 0.268, 1.61, sx + 0.012, 0.279, 1.63, M.steel, LAYER.SPRING, 'Spring clip', 0.002));
    }
  }
  // seat cushion (rides on the deck; explode lifts it off)
  const cush = new THREE.Group();
  deck.add(cush);
  {
    const w = SEAT.x1 - SEAT.x0, d = SEAT.z1 - SEAT.z0, h = SEAT.h;
    const o = { r: 0.055, puff: 0.006, bulge: 0.003, seg: [14, 3, 22] };
    const cx = (SEAT.x0 + SEAT.x1) / 2, cy = SEAT.y0 + h / 2, cz = (SEAT.z0 + SEAT.z1) / 2;
    cush.add(dAt(part(softBox(w, h, d, o), M.fabric, LAYER.CUSHION, 'Chaise seat cushion'), cx, cy, cz));
    cush.add(dAt(part(seamLoop(w, h, d, o, 'top'), M.seam, LAYER.DETAIL, 'Seam piping'), cx, cy, cz));
    cush.add(dAt(part(rbox(w - 0.035, h - 0.045, d - 0.035, 0.012), M.foam, LAYER.FOAM, 'HR foam 35 kg/m³'), cx, cy - 0.01, cz));
    cush.add(dAt(part(rbox(w - 0.02, 0.024, d - 0.02, 0.008), M.fibre, LAYER.FOAM, 'Fibre wrap'), cx, cy + h / 2 - 0.02, cz));
  }
  // fabric pull tab at the centre of the front edge
  {
    const s = new THREE.Shape();
    const tw = 0.044, th = 0.082, rr = 0.012;
    s.moveTo(-tw / 2 + rr, -th / 2); s.lineTo(tw / 2 - rr, -th / 2); s.quadraticCurveTo(tw / 2, -th / 2, tw / 2, -th / 2 + rr);
    s.lineTo(tw / 2, th / 2); s.lineTo(-tw / 2, th / 2); s.lineTo(-tw / 2, -th / 2 + rr); s.quadraticCurveTo(-tw / 2, -th / 2, -tw / 2 + rr, -th / 2);
    const slot = new THREE.Path();
    const sw = 0.024, sh = 0.012, sy = -0.016;
    slot.absarc(-sw / 2 + sh / 2, sy, sh / 2, Math.PI / 2, Math.PI * 1.5, false);
    slot.absarc(sw / 2 - sh / 2, sy, sh / 2, -Math.PI / 2, Math.PI / 2, false);
    s.holes.push(slot);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0012, bevelSegments: 2, curveSegments: 8 });
    g.translate(0, 0, -0.0015);
    g.computeVertexNormals();
    worldUV(g, 0.16);
    const tab = part(g, M.seam, LAYER.HARD, 'Storage pull tab');
    const tabG = new THREE.Group();
    tabG.add(tab);
    tabG.rotation.x = -0.05;
    tab.position.y = -th / 2;
    deck.add(dAt(tabG, (SEAT.x0 + SEAT.x1) / 2, 0.292, 1.7075));
    // the tab's strap runs under the cushion to the lid's front rail
    const strap = part(rbox(0.04, 0.003, 0.08, 0.001), M.seam, LAYER.HARD, 'Storage pull tab');
    deck.add(dAt(strap, (SEAT.x0 + SEAT.x1) / 2, 0.2775, 1.668));
    tabG.userData.strap = strap;
    controls.push({ object: tabG, id: 'chaise:storage:toggle', hint: 'Lift storage' });
  }

  // ======================================================================
  // LIFT MECHANISM (both sides): base brackets, four-bar links, gas struts
  // ======================================================================
  const LA = Math.hypot(LNK.A1[0] - LNK.A0[0], LNK.A1[1] - LNK.A0[1]);
  const LB = Math.hypot(LNK.B1[0] - LNK.B0[0], LNK.B1[1] - LNK.B0[1]);
  const LC = Math.hypot(LNK.B1[0] - LNK.A1[0], LNK.B1[1] - LNK.A1[1]);
  const PHI0 = Math.atan2(LNK.A1[0] - LNK.A0[0], LNK.A1[1] - LNK.A0[1]);
  const CANG0 = Math.atan2(LNK.B1[0] - LNK.A1[0], LNK.B1[1] - LNK.A1[1]);
  // precompute input angle → deck tilt table (input rocker turns toward vertical)
  const TAB = [];
  {
    const b = [LNK.B1[0], LNK.B1[1]];
    for (let k = 0; k <= 400; k++) {
      const phi = PHI0 - k * 0.25 * D2R;
      const ay = LNK.A0[0] + LA * Math.sin(phi), az = LNK.A0[1] + LA * Math.cos(phi);
      circleInt(ay, az, LC, LNK.B0[0], LNK.B0[1], LB, b[0], b[1], b);
      const th = Math.atan2(b[0] - ay, b[1] - az) - CANG0;
      TAB.push({ phi, th, by: b[0], bz: b[1] });
      if (th > LIFT_MAX + 2 * D2R) break;
    }
  }
  const mech = [];
  for (const side of [0, 1]) {
    const mx = (x) => (side === 0 ? x : MIRROR_X - x);
    const sgn = side === 0 ? 1 : -1;
    // base bracket (steel angle screwed through the felt into the frame rail)
    group.add(boxAt(Math.min(mx(PX.plate - 0.0015), mx(PX.plate + 0.0015)), 0.148, 0.50, Math.max(mx(PX.plate - 0.0015), mx(PX.plate + 0.0015)), 0.192, 1.005, M.steel, LAYER.HARD, 'Lift mechanism base bracket', 0.0015));
    group.add(boxAt(Math.min(mx(PX.plate), mx(PX.plate + 0.03)), wellFloorY, 0.50, Math.max(mx(PX.plate), mx(PX.plate + 0.03)), wellFloorY + 0.003, 1.005, M.steel, LAYER.HARD, 'Lift mechanism base bracket', 0.001));
    // ground pivots
    for (const [py, pz] of [LNK.A0, LNK.B0, STRUT_G]) {
      const x0 = PX.plate, x1 = (py === STRUT_G[0] && pz === STRUT_G[1]) ? PX.strut : PX.linkB;
      group.add(at(xCyl(0.0042, Math.abs(x1 - x0) + 0.004, M.chrome, LAYER.HARD, 'Pivot rivet', 10), mx((x0 + x1) / 2), py, pz));
      group.add(at(xCyl(0.009, 0.003, M.steel, LAYER.HARD, 'Pivot rivet', 14), mx(x0 + 0.0025 * 1), py, pz));
    }
    const linkA = makeLink(mx(PX.linkA), 'Lift-up hinge linkage');
    const linkB = makeLink(mx(PX.linkB), 'Lift-up hinge linkage');
    group.add(linkA.group, linkB.group);
    // deck bracket + its pins (move with the deck)
    const dpx0 = Math.min(mx(PX.deckPlate - 0.0015), mx(PX.deckPlate + 0.0015)), dpx1 = Math.max(mx(PX.deckPlate - 0.0015), mx(PX.deckPlate + 0.0015));
    deck.add(dBox2(dpx0, 0.19, 0.392, dpx1, 0.272, 1.045, M.steel, LAYER.HARD, 'Lift mechanism deck bracket', 0.0015));
    for (const [py, pz, x0] of [[LNK.A1[0], LNK.A1[1], PX.linkA], [LNK.B1[0], LNK.B1[1], PX.linkB], [STRUT_D[0], STRUT_D[1], PX.strut]]) {
      const x1 = PX.deckPlate;
      deck.add(dAt(xCyl(0.0042, Math.abs(x1 - x0) + 0.004, M.chrome, LAYER.HARD, 'Pivot rivet', 10), mx((x0 + x1) / 2), py, pz));
      deck.add(dAt(xCyl(0.0085, 0.006, M.steel, LAYER.HARD, 'Pivot rivet', 14), mx(x0), py, pz));
    }
    // gas strut
    const body = part(new THREE.CylinderGeometry(0.0095, 0.0095, STRUT_CYL, 16), M.steel, LAYER.HARD, 'Gas strut (lift assist)');
    const seal = part(new THREE.CylinderGeometry(0.0075, 0.0095, 0.008, 16), M.plastic, LAYER.HARD, 'Gas strut (lift assist)');
    const rodM = part(new THREE.CylinderGeometry(0.004, 0.004, 1, 10), M.chrome, LAYER.HARD, 'Gas strut piston rod');
    const eyeG = xCyl(0.0085, 0.008, M.steel, LAYER.HARD, 'Gas strut (lift assist)', 14);
    const eyeD = xCyl(0.0085, 0.008, M.steel, LAYER.HARD, 'Gas strut (lift assist)', 14);
    group.add(body, seal, rodM, at(eyeG, mx(PX.strut), STRUT_G[0], STRUT_G[1]), eyeD);
    mech.push({ x: mx(PX.strut), linkA, linkB, body, seal, rodM, eyeD, sgn });
  }

  // ======================================================================
  // FRAME (hidden in finished mode)
  // ======================================================================
  const wood = (x0, y0, z0, x1, y1, z1, label = 'Kiln-dried hardwood frame') => group.add(boxAt(x0, y0, z0, x1, y1, z1, M.wood, LAYER.FRAME, label));
  // base perimeter + cross rails
  wood(0.02, 0.14, 0.015, 1.0, 0.27, 0.045);                   // back rail
  wood(0.172, 0.14, 0.332, 1.0, 0.255, 0.362, 'Hardwood cross rail');   // well rear rail
  wood(0.975, 0.14, 0.045, 1.005, 0.255, 1.685);               // right rail
  wood(0.02, 0.14, 1.655, 0.975, 0.255, 1.685);                // front rail
  wood(0.175, 0.14, 0.045, 0.205, 0.255, 1.655);               // well left rail
  wood(0.02, 0.14, 1.12, 0.05, 0.255, 1.655);                  // corner plinth outer rail
  wood(0.05, 0.14, 1.12, 0.175, 0.255, 1.15, 'Hardwood cross rail');    // under arm front
  group.add(boxAt(0.172, 0.255, 0.045, 1.0, 0.267, 0.362, M.ply, LAYER.FRAME, 'Plywood rear deck'));
  group.add(boxAt(0.05, 0.255, 1.15, 0.175, 0.267, 1.655, M.ply, LAYER.FRAME, 'Plywood corner deck'));
  // corner blocks (triangular glue blocks)
  const cbGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.09, 3);
  for (const [x, z, rot] of [[0.205, 0.045, 0], [0.975, 0.045, 1], [0.05, 1.655, 3], [0.175, 1.12, 2]]) {
    const cb = part(cbGeo, M.wood, LAYER.FRAME, 'Hardwood corner block');
    cb.scale.set(0.55, 1, 0.55);
    cb.rotation.y = Math.PI / 6 + Math.PI + rot * Math.PI / 2;
    group.add(at(cb, x + (rot === 1 || rot === 2 ? -0.017 : 0.017), 0.20, z + (rot >= 2 ? -0.017 : 0.017)));
  }
  // arm frame: plywood panels, rails, posts + foam
  group.add(boxAt(0.016, 0.14, 0.12, 0.028, 0.47, 1.13, M.ply, LAYER.FRAME, 'Plywood arm panel'));
  group.add(boxAt(0.144, 0.14, 0.12, 0.156, 0.47, 1.13, M.ply, LAYER.FRAME, 'Plywood arm panel'));
  wood(0.028, 0.445, 0.12, 0.144, 0.47, 1.13);
  wood(0.028, 0.14, 0.12, 0.144, 0.165, 1.13);
  wood(0.028, 0.165, 1.10, 0.144, 0.445, 1.13);
  wood(0.028, 0.165, 0.12, 0.144, 0.445, 0.15);
  group.add(boxAt(0.012, 0.15, 0.13, 0.016, 0.47, 1.14, M.foam, LAYER.FOAM, 'Arm padding foam'));
  group.add(boxAt(0.156, 0.29, 0.13, 0.163, 0.47, 1.14, M.foam, LAYER.FOAM, 'Arm padding foam'));
  group.add(boxAt(0.014, 0.47, 0.13, 0.162, 0.484, 1.145, M.foam, LAYER.FOAM, 'Arm padding foam'));
  group.add(boxAt(0.014, 0.15, 1.13, 0.162, 0.47, 1.15, M.foam, LAYER.FOAM, 'Arm padding foam'));
  // back: vertical plywood panel + leaning stiles/rails with elastic webbing
  group.add(boxAt(0.02, 0.14, 0.012, 1.0, 0.88, 0.022, M.ply, LAYER.FRAME, 'Plywood back panel'));
  const bf = new THREE.Group();
  bf.position.set(0, Y_TOP, DIM.backShellT);
  bf.rotation.x = -LEAN;
  group.add(bf);
  {
    const st = (x0, x1, v0, v1) => bf.add(boxAt(x0, v0, -0.045, x1, v1, -0.017, M.wood, LAYER.FRAME, 'Back frame stile'));
    st(0.02, 0.05, 0.0, 0.58); st(0.97, 1.0, 0.0, 0.58); st(0.495, 0.525, 0.0, 0.58);
    bf.add(boxAt(0.05, 0.545, -0.045, 0.97, 0.58, -0.017, M.wood, LAYER.FRAME, 'Kiln-dried hardwood frame'));
    bf.add(boxAt(0.05, 0.0, -0.045, 0.97, 0.04, -0.017, M.wood, LAYER.FRAME, 'Kiln-dried hardwood frame'));
    bf.add(boxAt(0.05, 0.23, -0.045, 0.97, 0.28, -0.017, M.wood, LAYER.FRAME, 'Headrest hinge mounting rail'));
    for (const x of [0.11, 0.21, 0.31, 0.41, 0.61, 0.71, 0.81, 0.91]) bf.add(boxAt(x - 0.025, 0.02, -0.0165, x + 0.025, 0.56, -0.0135, M.webbing, LAYER.SPRING, 'Elastic webbing'));
    for (const v of [0.14, 0.33, 0.47]) for (const [x0, x1] of [[0.05, 0.495], [0.525, 0.97]]) bf.add(boxAt(x0, v - 0.025, -0.0135, x1, v + 0.025, -0.0105, M.webbing, LAYER.SPRING, 'Elastic webbing'));
  }

  // ======================================================================
  // LEGS (four splayed corner legs + hidden centre glide)
  // NOTE: core.taperedLeg tilts the foot toward −x for +splayX and toward −z
  // for +splayZ, so outward splay uses +X on the left, −Z at the front.
  // ======================================================================
  const SX = 0.14, SZ = 0.09;
  for (const [x, z, sx, sz] of [[0.055, 0.06, SX, SZ], [0.965, 0.06, -SX, SZ], [0.055, 1.645, SX, -SZ], [0.975, 1.66, -SX, -SZ]]) {
    group.add(at(taperedLeg(DIM.legH, { splayX: sx, splayZ: sz, label: 'Tapered metal leg' }), x, DIM.legH + 0.003, z));
  }
  {
    const glide = part(new THREE.CylinderGeometry(0.02, 0.024, Y_BOT - 0.006, 16), M.plastic, LAYER.HARD, 'Centre support glide');
    group.add(at(glide, 0.59, (Y_BOT - 0.006) / 2 + 0.006, 1.0));
    group.add(at(part(new THREE.CylinderGeometry(0.026, 0.026, 0.006, 16), M.rubber, LAYER.HARD, 'Centre support glide'), 0.59, 0.003, 1.0));
  }

  // ======================================================================
  // SEAT CAMERA
  // ======================================================================
  const anchor = new THREE.Object3D();
  anchor.name = 'chaise-seat';
  group.add(anchor);
  seats.push({ id: 'chaise', label: 'Chaise', anchor });

  // ======================================================================
  // POSE
  // ======================================================================
  const bOut = [0, 0];
  function solveLift(theta) {
    // find input angle for the requested tilt from the table, then solve exactly
    let i = 1;
    while (i < TAB.length - 1 && TAB[i].th < theta) i++;
    const p0 = TAB[i - 1], p1 = TAB[i];
    const t = p1.th === p0.th ? 0 : clamp01((theta - p0.th) / (p1.th - p0.th));
    const phi = p0.phi + (p1.phi - p0.phi) * t;
    const ay = LNK.A0[0] + LA * Math.sin(phi), az = LNK.A0[1] + LA * Math.cos(phi);
    circleInt(ay, az, LC, LNK.B0[0], LNK.B0[1], LB, p0.by + (p1.by - p0.by) * t, p0.bz + (p1.bz - p0.bz) * t, bOut);
    const th = theta <= 0 ? 0 : Math.atan2(bOut[0] - ay, bOut[1] - az) - CANG0;
    return { ay: theta <= 0 ? LNK.A1[0] : ay, az: theta <= 0 ? LNK.A1[1] : az, by: theta <= 0 ? LNK.B1[0] : bOut[0], bz: theta <= 0 ? LNK.B1[1] : bOut[1], th };
  }

  const _g = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
  function apply() {
    const s = params.storage, h = params.head, e = params.explode;

    // --- storage lid ---------------------------------------------------
    const L = solveLift(s * LIFT_MAX);
    deck.position.set(0, L.ay, L.az);
    deck.rotation.x = -L.th;
    const c = Math.cos(L.th), sn = Math.sin(L.th);
    const ddy = STRUT_D[0] - OY, ddz = STRUT_D[1] - OZ;
    const Dy = L.ay + ddy * c + ddz * sn, Dz = L.az - ddy * sn + ddz * c;
    for (const m of mech) {
      aimLink(m.linkA, LNK.A0[0], LNK.A0[1], L.ay, L.az);
      aimLink(m.linkB, LNK.B0[0], LNK.B0[1], L.by, L.bz);
      _g.set(m.x, STRUT_G[0], STRUT_G[1]);
      _d.set(m.x, Dy, Dz);
      m.eyeD.position.copy(_d);
      _dir.subVectors(_d, _g);
      const len = _dir.length();
      _dir.multiplyScalar(1 / len);
      m.body.position.copy(_g).addScaledVector(_dir, STRUT_EYE + STRUT_CYL / 2);
      m.body.quaternion.setFromUnitVectors(_up, _dir);
      m.seal.position.copy(_g).addScaledVector(_dir, STRUT_EYE + STRUT_CYL + 0.004);
      m.seal.quaternion.copy(m.body.quaternion);
      const r0 = STRUT_EYE + STRUT_CYL + 0.008, rl = Math.max(0.005, len - STRUT_EYE - r0);
      _e.copy(_g).addScaledVector(_dir, r0 + rl / 2);
      m.rodM.position.copy(_e);
      m.rodM.quaternion.copy(m.body.quaternion);
      m.rodM.scale.set(1, rl, 1);
    }

    // --- explode --------------------------------------------------------
    cush.position.set(0, 0.22 * e, 0);
    corner.position.set(0, 0.22 * e, 0);
    bolster.position.set(0, 0.20 * e, 0);
    backG.position.set(0, BACK_O.y + 0.40 * e, BACK_O.z + 0.08 * e);

    // --- headrest -------------------------------------------------------
    headG.position.set(0, SEAM_V + 0.06 * e, HEAD_PIVOT_W);
    headG.rotation.x = HEAD_MAX * h;

    // --- seat camera (leaning on the back, legs stretched along the chaise)
    anchor.position.set(0.595, 1.12 - 0.015 * h, 0.35 + 0.04 * h);
    anchor.rotation.set((8 + 4 * h) * D2R, 0, 0);
  }

  function set(param, value) {
    if (!(param in params)) return;
    params[param] = clamp01(+value || 0);
    apply();
  }
  apply();

  return { name: 'chaise', group, width: W, params, set, controls, seats };
}
