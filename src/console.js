// console.js — the narrow upholstered separator between the bed seat and
// recliner A (see reference.jpg). A tall rear bolster block fills the gap
// between the neighbouring back cushions; an arm-height front block carries
// two stainless cup holders, a lift-up padded storage lid over a felt-lined
// bin (Qi pad + USB), and — on its right side face — the power-recline switch
// panel for recliner A. Inside: birch-ply + beech box frame, foam wrap, steel
// hinges, a soft-close gas stay and the power hub that feeds the recliners.
//
// Module frame: x 0→0.28 (left→right from the front), y up from the floor,
// z 0 = back face, +z toward the front (seat fronts at z = 1.02).
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { DIM, LAYER, part, softBox, rbox, rail, tube, worldUV, taperedLeg, clamp01, smooth, phase } from './core.js';
import { M, glyphMaterial } from './materials.js';

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------
const W = DIM.W.console;            // 0.28
const DEPTH = DIM.depth;            // 1.02
const CX = W / 2;
const TOP = DIM.armH;               // 0.62  top of the front block
const BASE_Y = DIM.legH;            // 0.13  underside of the upholstery
const BS = 0.014;                   // horizontal roll of every boxed edge
const BT_PAD = 0.020, BT_BODY = 0.024;
const PAD_Y0 = 0.570;               // padded top panel: 0.570 → 0.620
const BODY_Y1 = 0.585;              // boxed body: 0.13 → 0.585 (top tucked under the pad)
const Z_PAD = 0.292;                // padded top panel tucks 8 mm into the bolster face
const BOL_Y0 = 0.50;                // bolster block rises out of the boxed base
const REAR_D = 0.30;                // rear block depth at arm height
const LEAN = Math.tan(DIM.backLean);
// Front face of the rear block leans back like the neighbouring back cushions.
const rearFrontZ = (y) => REAR_D - Math.max(0, y - TOP) * LEAN;
const REAR_BODY_TOP = 0.80, REAR_PAD_Y0 = 0.775, REAR_PAD_Y1 = 0.865;

// Storage opening (vertical padded walls), bin and lid.
const OW = { x0: 0.046, x1: 0.234, z0: 0.377, z1: 0.683, r: 0.008 };
const BIN = { x0: 0.047, x1: 0.233, z0: 0.378, z1: 0.682, r: 0.007, t: 0.003, floor: 0.400, top: 0.590 };
const LID = { x0: 0.0485, x1: 0.2315, z0: 0.3795, z1: 0.6805, y0: 0.588, y1: 0.620 };
const AX_Y = 0.6205, AX_Z = 0.379;  // hinge axis: the lid's top-back edge
const LID_OPEN = THREE.MathUtils.degToRad(105);

// Cup holders (front, rear)
const CUP_Z = [0.925, 0.795];
const CUP_WALL = 0.042;             // padded hole wall radius
const CUP_RC = CUP_WALL + BS;       // hole radius at the top surface
const SLEEVE_RI = 0.0405, SLEEVE_RO = 0.0415, SLEEVE_TOP = 0.600, SLEEVE_FLOOR = 0.513;
const COLLAR_RI = 0.0398, COLLAR_Y0 = 0.589;
const CUP_DROP = 0.10;

// Switch panel on the right side face
const SW = { y: 0.52, z: 0.86, h: 0.045, d: 0.090 };

// core.taperedLeg's floor glide extends ~1 mm past the leg and the splay tilt
// drops its rim a further ~1.3 mm, so shorten the leg to keep it above y = 0.
const LEG_H = DIM.legH - 0.0025;

// Explode offsets
const EX = { pad: 0.17, rearPad: 0.20, lid: 0.30 };

// ---------------------------------------------------------------------------
// Local geometry helpers
// ---------------------------------------------------------------------------
const V2 = (x, y) => new THREE.Vector2(x, y);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Rounded rectangle polyline in a 2D plane (u = x, v = z). r: number or
// [r(u0,v0), r(u1,v0), r(u1,v1), r(u0,v1)].
function rrect(u0, v0, u1, v1, r, n = 8) {
  const R = Array.isArray(r) ? r : [r, r, r, r];
  const pts = [];
  const corner = (cu, cv, rad, a0) => {
    if (rad <= 1e-6) { pts.push(V2(cu, cv)); return; }
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * Math.PI / 2;
      pts.push(V2(cu + Math.cos(a) * rad, cv + Math.sin(a) * rad));
    }
  };
  corner(u1 - R[1], v0 + R[1], R[1], -Math.PI / 2);
  corner(u1 - R[2], v1 - R[2], R[2], 0);
  corner(u0 + R[3], v1 - R[3], R[3], Math.PI / 2);
  corner(u0 + R[0], v0 + R[0], R[0], Math.PI);
  return pts;
}
function circle(cu, cv, r, n = 48) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push(V2(cu + Math.cos(a) * r, cv + Math.sin(a) * r)); }
  return pts;
}

// Insert points so no edge of a closed polyline is longer than `step`.
function subdiv(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / step));
    for (let k = 0; k < n; k++) out.push(a.clone().lerp(b, k / n));
  }
  return out;
}

// Horizontal slab with holes, extruded vertically from y0 to y1. Shape coords
// are (x, z). With bt > 0 every edge (outer and hole) gets a soft elliptical
// roll: the outer walls end up `bs` OUTSIDE the outline and hole walls `bs`
// INSIDE the hole outline — pass outlines accordingly.
function slab(outer, holes, y0, y1, { bs = 0, bt = 0, segs = 6, steps = 1, smoothN = bt > 0, uv = true } = {}) {
  const shape = new THREE.Shape(outer);
  for (const h of holes) shape.holes.push(new THREE.Path(h));
  const depth = Math.max(1e-4, (y1 - y0) - 2 * bt);
  let g = new THREE.ExtrudeGeometry(shape, {
    depth, steps, bevelEnabled: bt > 0, bevelThickness: bt, bevelSize: bs, bevelOffset: 0,
    bevelSegments: segs, curveSegments: 1,
  });
  g.rotateX(Math.PI / 2);              // shape v → +z, extrusion → −y
  g.translate(0, y1 - bt, 0);
  if (smoothN) {
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g, 1e-6);
    g.computeVertexNormals();
  }
  if (uv) worldUV(g);
  return g;
}

// Flat plywood panel with cut-outs. plyYZ: lies in a constant-x plane centred
// on xc (outline in (z, y)); plyXY: constant-z plane centred on zc (outline in (x, y)).
function plyPanel(u0, u1, v0, v1, t, cuts) {
  const s = new THREE.Shape(rrect(u0, v0, u1, v1, 0));
  for (const c of cuts) s.holes.push(new THREE.Path(c));
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -t / 2);
  return g;
}
function plyYZ(z0, z1, y0, y1, t, xc, cuts = []) {
  const g = plyPanel(z0, z1, y0, y1, t, cuts);
  g.rotateY(-Math.PI / 2);             // u → +z, thickness → x
  g.translate(xc, 0, 0);
  return g;
}
function plyXY(x0, x1, y0, y1, t, zc, cuts = []) {
  const g = plyPanel(x0, x1, y0, y1, t, cuts);
  g.translate(0, 0, zc);
  return g;
}

// Flat downward-facing panel (dust covers, lid liner) from a 2D outline.
function underPanel(pts, y) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts));
  g.rotateX(Math.PI / 2);              // faces −y
  g.translate(0, y, 0);
  return g;
}

// Taper a rear-block geometry (already in module coords) so its front face
// leans back above arm height; the back face (z = 0) stays put.
function taperRear(g) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * rearFrontZ(p.getY(i)) / REAR_D);
  g.computeVertexNormals();
  return worldUV(g);
}

// Closed lathe from a 2D (r, y) profile traversed so the solid is on the right
// (outward normals). Points with r = 0 are allowed.
function lathe(profile, segs = 48) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => V2(Math.max(r, 0), y)), segs);
}

// Cylinder aimed between two points without allocating (for the gas stay).
const _up = V3(0, 1, 0), _d = V3(0, 0, 0);
function aimCyl(mesh, a, b) {
  _d.subVectors(b, a);
  const len = Math.max(1e-5, _d.length());
  mesh.position.copy(a).addScaledVector(_d, 0.5);
  mesh.quaternion.setFromUnitVectors(_up, _d.divideScalar(len));
  mesh.scale.set(1, len / mesh.geometry.parameters.height, 1);
}

// ---------------------------------------------------------------------------
export function createConsole({ controlsFor = 'reclinerA' } = {}) {
  const group = new THREE.Group();
  group.name = 'console';
  const params = { lid: 0, cups: 0, explode: 0 };
  const controls = [];

  const add = (parent, mesh, x = 0, y = 0, z = 0) => { mesh.position.set(x, y, z); parent.add(mesh); return mesh; };
  const P = (geo, mat, layer, label, x, y, z, parent = group, opts) => add(parent, part(geo, mat, layer, label, opts), x, y, z);

  // Moving sub-assemblies
  const padG = new THREE.Group();      // padded top panel + rims + mugs (lifts in explode)
  const rearPadG = new THREE.Group();  // rear bolster top pad (lifts in explode)
  const lidHinge = new THREE.Group();  // rotates with the lid; hinge leaves + stay bracket
  const lidPivot = new THREE.Group();  // rotates with the lid AND lifts in explode
  lidHinge.position.set(0, AX_Y, AX_Z);
  lidPivot.position.set(0, AX_Y, AX_Z);
  group.add(padG, rearPadG, lidHinge, lidPivot);

  // ===== Outlines shared by body / pad / foam ==============================
  const baseOutline = rrect(BS, BS, W - BS, DEPTH - BS, [0.004, 0.004, 0.022, 0.022], 10);
  const padOutline = rrect(BS, Z_PAD + BS, W - BS, DEPTH - BS, [0.004, 0.004, 0.022, 0.022], 10);
  const openingOutline = rrect(OW.x0 - BS, OW.z0 - BS, OW.x1 + BS, OW.z1 + BS, OW.r + BS, 8);
  const cupOutlines = CUP_Z.map((z) => circle(CX, z, CUP_RC, 56));

  // ===== Upholstery =========================================================
  // Boxed base (full depth) and the padded top panel over the front block,
  // joined by a welt.
  P(slab(baseOutline, [openingOutline, ...cupOutlines], BASE_Y, BODY_Y1, { bs: BS, bt: BT_BODY }),
    M.fabric, LAYER.SHELL, 'Upholstered console body', 0, 0, 0);
  P(slab(padOutline, [openingOutline, ...cupOutlines], PAD_Y0, TOP, { bs: BS, bt: BT_PAD }),
    M.fabric, LAYER.CUSHION, 'Padded top panel', 0, 0, 0, padG);

  // Rear bolster block: leans back above arm height to follow the back cushions.
  // Same rolled edge as the base; inset 1 mm so no faces are coplanar with it.
  const RW = W - 0.002;
  const bo = subdiv(rrect(0.001 + BS, 0.001 + BS, W - 0.001 - BS, REAR_D - BS, [0.004, 0.004, 0.020, 0.020], 8), 0.02);
  const rb = slab(bo, [], BOL_Y0, REAR_BODY_TOP, { bs: BS, bt: BT_BODY, steps: 14, uv: false });
  {
    // soft crown on the exposed (leaning) front face
    const p = rb.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (y <= TOP || z < REAR_D - 0.03) continue;
      const fx = Math.max(0, 1 - ((x - CX) / (W / 2)) ** 2);
      const fy = Math.sin(Math.PI * Math.min(1, (y - TOP) / (REAR_BODY_TOP - TOP)));
      const fz = Math.min(1, (z - (REAR_D - 0.03)) / 0.03);
      p.setZ(i, z + 0.006 * fx * fy * fz);
    }
  }
  P(taperRear(rb), M.fabric, LAYER.SHELL, 'Upholstered rear bolster', 0, 0, 0);
  const rp = softBox(RW, REAR_PAD_Y1 - REAR_PAD_Y0, REAR_D, { r: 0.04, puff: 0.012, puffZ: 0.005, edgeSeg: 5 });
  rp.translate(CX, (REAR_PAD_Y0 + REAR_PAD_Y1) / 2, REAR_D / 2);
  P(taperRear(rp), M.fabric, LAYER.CUSHION, 'Padded bolster top', 0, 0, 0, rearPadG);

  // Black cambric dust cover under the whole console.
  P(underPanel(rrect(0.02, 0.02, W - 0.02, DEPTH - 0.022, 0.012, 4), BASE_Y - 0.0005),
    M.underside, LAYER.SHELL, 'Cambric dust cover', 0, 0, 0, group, { cast: false });

  // ----- Welt piping -------------------------------------------------------
  {
    // Front block: U-shaped welt in the crease between body and top panel.
    const yW = 0.5768, ins = 0.0045, rr = 0.036 - ins;
    const x0 = ins, x1 = W - ins, z1 = DEPTH - ins, zb = 0.296;
    const pts = [];
    const line = (a, b, n) => { for (let i = 0; i < n; i++) pts.push(a.clone().lerp(b, i / n)); };
    const arc = (cx, cz, a0, a1, n) => { for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (i / n); pts.push(V3(cx + Math.cos(a) * rr, yW, cz + Math.sin(a) * rr)); } };
    // both ends dive into the bolster/pad junction so no tube end shows
    pts.push(V3(0.024, yW, zb - 0.010), V3(0.013, yW, zb - 0.004));
    line(V3(x0, yW, zb), V3(x0, yW, z1 - rr), 24);
    arc(x0 + rr, z1 - rr, Math.PI, Math.PI / 2, 10);
    line(V3(x0 + rr, yW, z1), V3(x1 - rr, yW, z1), 10);
    arc(x1 - rr, z1 - rr, Math.PI / 2, 0, 10);
    line(V3(x1, yW, z1 - rr), V3(x1, yW, zb), 24);
    pts.push(V3(x1, yW, zb), V3(W - 0.013, yW, zb - 0.004), V3(W - 0.024, yW, zb - 0.010));
    P(tube(pts, 0.0034, 170, false, 6), M.seam, LAYER.DETAIL, 'Welt piping', 0, 0, 0, group, { cast: false });

    // Rear bolster: welt loop where the top pad meets the bolster body.
    const yR = 0.7950, insR = 0.0070, rR = 0.034 - insR;
    const zf = rearFrontZ(yR) - insR;
    const rp2 = [];
    const ln = (a, b, n) => { for (let i = 0; i < n; i++) rp2.push(a.clone().lerp(b, i / n)); };
    const ar = (cx, cz, a0, a1, n) => { for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (i / n); rp2.push(V3(cx + Math.cos(a) * rR, yR, cz + Math.sin(a) * rR)); } };
    const xa = insR, xb = W - insR, za = insR;
    ln(V3(xa, yR, za + rR), V3(xa, yR, zf - rR), 10); ar(xa + rR, zf - rR, Math.PI, Math.PI / 2, 8);
    ln(V3(xa + rR, yR, zf), V3(xb - rR, yR, zf), 10); ar(xb - rR, zf - rR, Math.PI / 2, 0, 8);
    ln(V3(xb, yR, zf - rR), V3(xb, yR, za + rR), 10); ar(xb - rR, za + rR, 0, -Math.PI / 2, 8);
    ln(V3(xb - rR, yR, za), V3(xa + rR, yR, za), 10); ar(xa + rR, za + rR, -Math.PI / 2, -Math.PI, 8);
    P(tube(rp2, 0.0032, 170, true, 6), M.seam, LAYER.DETAIL, 'Welt piping', 0, 0, 0, group, { cast: false });
  }

  // ===== Legs ==============================================================
  for (const [x, z] of [[0.065, 0.075], [W - 0.065, 0.075], [0.06, 0.96], [W - 0.06, 0.96]]) {
    const leg = taperedLeg(LEG_H, { splayX: x < CX ? 0.07 : -0.07, splayZ: z > 0.5 ? -0.12 : 0.12, label: 'Tapered metal leg' });
    leg.position.set(x, BASE_Y, z);
    group.add(leg);
  }

  // ===== Cup holders ========================================================
  // Brushed stainless trim ring: follows the padded roll into the hole and
  // ends in a short collar that sits inside the black sleeve.
  const rimGeo = (() => {
    const roll = (phi, off) => {
      const nr = -BT_PAD * Math.sin(phi), ny = BS * Math.cos(phi), nl = Math.hypot(nr, ny);
      return [CUP_RC - BS * Math.sin(phi) + (nr / nl) * off, TOP - BT_PAD * (1 - Math.cos(phi)) + (ny / nl) * off];
    };
    const N = 9, prof = [];
    const tOff = 0.0016, uOff = 0.0003, rOut = CUP_RC + 0.0026;
    prof.push([rOut, TOP + 0.0009]);                          // outer edge (top)
    prof.push([rOut - 0.0007, TOP + tOff]);
    for (let i = 0; i <= N; i++) prof.push(roll((i / N) * Math.PI / 2, tOff)); // top surface, outer → inner
    prof.push([COLLAR_RI, SLEEVE_TOP - 0.003]);               // collar inner face
    prof.push([COLLAR_RI, COLLAR_Y0]);
    prof.push([SLEEVE_RI - 0.0002, COLLAR_Y0]);               // collar bottom
    prof.push([SLEEVE_RI - 0.0002, SLEEVE_TOP - 0.001]);      // collar outer face
    for (let i = N; i >= 0; i--) prof.push(roll((i / N) * Math.PI / 2, uOff)); // underside, inner → outer
    prof.push([rOut - 0.0007, TOP + uOff]);
    prof.push([rOut, TOP + 0.0009]);
    return lathe(prof, 56);
  })();
  const ST = SLEEVE_TOP - 0.0018;      // lip tucks just under the rim
  const sleeveGeo = lathe([
    [SLEEVE_RO, ST], [SLEEVE_RI, ST],                        // top lip
    [SLEEVE_RI, SLEEVE_FLOOR + 0.004], [SLEEVE_RI - 0.003, SLEEVE_FLOOR], [0, SLEEVE_FLOOR], // inner wall + floor
    [0, SLEEVE_FLOOR - 0.004], [SLEEVE_RO - 0.003, SLEEVE_FLOOR - 0.004], [SLEEVE_RO, SLEEVE_FLOOR - 0.001], // underside
    [SLEEVE_RO, ST],
  ], 48);
  const matGeo = new THREE.CylinderGeometry(SLEEVE_RI - 0.0035, SLEEVE_RI - 0.0035, 0.002, 40);
  const ledGeo = new THREE.TorusGeometry(SLEEVE_RI + 0.0001, 0.0008, 4, 64).rotateX(Math.PI / 2);

  const cupRims = new THREE.Group();   // the 'Cups' control
  padG.add(cupRims);
  for (const z of CUP_Z) {
    add(cupRims, part(rimGeo, M.stainless, LAYER.HARD, 'Brushed stainless cup rim', { cast: false }), CX, 0, z);
    P(sleeveGeo, M.plastic, LAYER.HARD, 'Cup holder sleeve', CX, 0, z, group, { cast: false });
    P(matGeo, M.rubber, LAYER.HARD, 'Rubber cup mat', CX, SLEEVE_FLOOR + 0.001, z, group, { cast: false });
    P(ledGeo, M.led, LAYER.HARD, 'Ambient LED ring', CX, COLLAR_Y0 - 0.0012, z, group, { cast: false });
  }
  controls.push({ object: cupRims, id: 'console:cups:toggle', hint: 'Cups' });

  // ----- Mugs (cups param) ------------------------------------------------
  // Slightly conical ceramic mug that hangs on the rim (wedges at the collar).
  const MUG = { rb: 0.036, rt: 0.046, h: 0.1035, wall: 0.0036 };
  const mugR = (h) => MUG.rb + (MUG.rt - MUG.rb) * (h / MUG.h);
  const mugGeo = lathe([
    [0, 0], [MUG.rb - 0.003, 0], [MUG.rb - 0.0004, 0.0012], [MUG.rb, 0.004],
    [MUG.rt, MUG.h - 0.0012], [MUG.rt - 0.0006, MUG.h], [MUG.rt - MUG.wall + 0.0006, MUG.h],
    [MUG.rt - MUG.wall, MUG.h - 0.0012],
    [mugR(0.012) - MUG.wall, 0.012], [mugR(0.012) - MUG.wall - 0.003, 0.0092], [0, 0.0092],
  ], 44);
  const COFFEE_H = 0.093;
  const coffeeGeo = new THREE.CircleGeometry(mugR(COFFEE_H) - MUG.wall + 0.0004, 48).rotateX(-Math.PI / 2);
  const H_ARC = 1.35 * Math.PI, H_R = 0.0135, H_T = 0.0042, H_C = 0.082;
  const handleGeo = new THREE.TorusGeometry(H_R, H_T, 10, 28, H_ARC).rotateZ(-H_ARC / 2);
  const handleX = mugR(H_C) - 0.0025 - H_R * Math.cos(H_ARC / 2); // arc ends sit inside the wall
  // Lowest mug seat such that the cone clears the collar and the rim's roll.
  const mugSeat = (() => {
    const pts = [[COLLAR_RI, COLLAR_Y0], [COLLAR_RI, SLEEVE_TOP - 0.003]];
    for (let i = 0; i <= 40; i++) {
      const phi = (i / 40) * Math.PI / 2;
      const nr = -BT_PAD * Math.sin(phi), ny = BS * Math.cos(phi), nl = Math.hypot(nr, ny);
      pts.push([CUP_RC - BS * Math.sin(phi) + (nr / nl) * 0.0016, TOP - BT_PAD * (1 - Math.cos(phi)) + (ny / nl) * 0.0016]);
    }
    const k = (MUG.rt - MUG.rb) / MUG.h, c = 0.0004;
    let b = -1;
    for (const [r, y] of pts) b = Math.max(b, y - (r - c - MUG.rb) / k);
    return b;
  })();
  const mugs = [];
  CUP_Z.forEach((z, i) => {
    const g = new THREE.Group();
    g.position.set(CX, mugSeat, z);
    g.rotation.y = i === 0 ? -0.55 : Math.PI + 0.55;   // handles toward each neighbour, angled to the front
    add(g, part(mugGeo, M.ceramic, LAYER.HARD, 'Ceramic mug'));
    add(g, part(handleGeo, M.ceramic, LAYER.HARD, 'Ceramic mug'), handleX, H_C, 0);
    add(g, part(coffeeGeo, M.coffee, LAYER.HARD, 'Coffee', { cast: false }), 0, COFFEE_H, 0);
    padG.add(g);
    mugs.push(g);
  });

  // ===== Storage bin, lid ===================================================
  {
    const outer = rrect(BIN.x0, BIN.z0, BIN.x1, BIN.z1, BIN.r, 6);
    const inner = rrect(BIN.x0 + BIN.t, BIN.z0 + BIN.t, BIN.x1 - BIN.t, BIN.z1 - BIN.t, BIN.r - BIN.t * 0.7, 6);
    P(slab(outer, [inner], BIN.floor + 0.004, BIN.top, { smoothN: false }), M.felt, LAYER.HARD, 'Felt-lined storage bin', 0, 0, 0);
    P(slab(outer, [], BIN.floor, BIN.floor + 0.004, { smoothN: false }), M.felt, LAYER.HARD, 'Felt-lined storage bin', 0, 0, 0);
    // Qi wireless charging pad on the floor
    const fy = BIN.floor + 0.004;
    P(rbox(0.088, 0.007, 0.088, 0.0035, 2), M.plastic, LAYER.HARD, 'Qi wireless charging pad', CX, fy + 0.0035, 0.545);
    P(new THREE.TorusGeometry(0.027, 0.0008, 6, 64).rotateX(Math.PI / 2), M.led, LAYER.HARD, 'Qi wireless charging pad', CX, fy + 0.0072, 0.545, group, { cast: false });
    P(new THREE.CylinderGeometry(0.009, 0.009, 0.0006, 32), M.rubber, LAYER.HARD, 'Qi wireless charging pad', CX, fy + 0.0071, 0.545, group, { cast: false });
    // USB-A + USB-C ports on the back wall (faces the user when the lid is up)
    const wz = BIN.z0 + BIN.t;
    P(rbox(0.050, 0.020, 0.003, 0.003, 2), M.panel, LAYER.HARD, 'USB-A / USB-C charging ports', CX, 0.548, wz + 0.0015);
    P(rbox(0.0128, 0.0050, 0.0012, 0.0008, 1), M.stainless, LAYER.HARD, 'USB-A / USB-C charging ports', CX - 0.011, 0.548, wz + 0.0032);
    P(rbox(0.0112, 0.0034, 0.0012, 0.0005, 1), M.rubber, LAYER.HARD, 'USB-A / USB-C charging ports', CX - 0.011, 0.548, wz + 0.0037);
    P(rbox(0.0090, 0.0032, 0.0012, 0.0015, 1), M.stainless, LAYER.HARD, 'USB-A / USB-C charging ports', CX + 0.012, 0.548, wz + 0.0032);
    P(rbox(0.0076, 0.0019, 0.0012, 0.0009, 1), M.rubber, LAYER.HARD, 'USB-A / USB-C charging ports', CX + 0.012, 0.548, wz + 0.0037);
  }

  // Lid: padded top + ply core + felt liner + stainless finger pull, hinged
  // at its top-back edge so it swings up and back clear of the bolster.
  {
    const lw = LID.x1 - LID.x0, ld = LID.z1 - LID.z0, lh = LID.y1 - LID.y0;
    const lx = (LID.x0 + LID.x1) / 2 - 0, ly = (LID.y0 + LID.y1) / 2 - AX_Y, lz = (LID.z0 + LID.z1) / 2 - AX_Z;
    const LPUFF = 0.008;
    P(softBox(lw, lh, ld, { r: 0.012, puff: LPUFF, edgeSeg: 4 }), M.fabric, LAYER.CUSHION, 'Padded storage lid', lx, ly, lz, lidPivot);
    // top-stitching inset 14 mm, following the crown
    const ins = 0.014, hx = lw / 2, hz = ld / 2, hy = lh / 2;
    const sp = rrect(-hx + ins, -hz + ins, hx - ins, hz - ins, 0.01, 4).map((q) => {
      const fx = Math.max(0, 1 - (q.x / hx) ** 2), fz = Math.max(0, 1 - (q.y / hz) ** 2);
      return V3(q.x, hy + LPUFF * fx * fz + 0.0004, q.y);
    });
    const dense = [];
    for (let i = 0; i < sp.length; i++) { const a = sp[i], b = sp[(i + 1) % sp.length]; for (let k = 0; k < 4; k++) dense.push(a.clone().lerp(b, k / 4)); }
    P(tube(dense, 0.0011, 150, true, 4), M.seam, LAYER.DETAIL, 'Top-stitching', lx, ly, lz, lidPivot, { cast: false });
    // internals of the lid
    P(rbox(lw - 0.022, 0.009, ld - 0.022, 0.002), M.ply, LAYER.FRAME, 'Birch-ply lid core 9 mm', lx, 0.5955 - AX_Y, lz, lidPivot);
    P(rail(lw - 0.026, 0.015, ld - 0.026), M.foam, LAYER.FOAM, 'HR foam 30 kg/m³', lx, 0.6075 - AX_Y, lz, lidPivot);
    P(rail(lw - 0.020, 0.003, ld - 0.020), M.fibre, LAYER.FOAM, 'Dacron fibre wrap', lx, 0.6165 - AX_Y, lz, lidPivot);
    // felt liner underneath (seen when open)
    const liner = rrect(LID.x0 + 0.006, LID.z0 + 0.006 - AX_Z, LID.x1 - 0.006, LID.z1 - 0.006 - AX_Z, 0.008, 4);
    P(slab(liner, [], LID.y0 - 0.0015 - AX_Y, LID.y0 + 0.0005 - AX_Y, { smoothN: false }), M.felt, LAYER.HARD, 'Felt lid liner', 0, 0, 0, lidPivot);
    // stainless finger pull on the front edge
    P(rbox(0.044, 0.0028, 0.013, 0.0012, 2), M.stainless, LAYER.HARD, 'Finger pull', lx, 0.6186 - AX_Y, LID.z1 - 0.0005 - AX_Z, lidPivot);
  }
  controls.push({ object: lidPivot, id: 'console:lid:toggle', hint: 'Open storage' });

  // ===== Switch panel (recliner A controls) on the right side face =========
  {
    const sx = W;  // side face plane
    P(rbox(0.0016, SW.h + 0.0025, SW.d + 0.0025, 0.0008, 2), M.rubber, LAYER.HARD, 'Recline switch panel', sx - 0.0002, SW.y, SW.z, group, { cast: false });
    P(rbox(0.0040, SW.h, SW.d, 0.0016, 2), M.panel, LAYER.HARD, 'Recline switch panel', sx - 0.0012, SW.y, SW.z, group, { cast: false });
    const face = sx + 0.0008;                      // panel face
    const glyphGeo = new THREE.PlaneGeometry(0.0145, 0.0145).rotateY(Math.PI / 2);
    const buttons = [
      ['recline', '+', 'recline+', 'Recline', SW.y + 0.01075, SW.z + 0.0315],
      ['recline', '-', 'recline-', 'Return upright', SW.y - 0.01075, SW.z + 0.0315],
      ['head', '+', 'head+', 'Raise headrest', SW.y + 0.01075, SW.z + 0.0100],
      ['head', '-', 'head-', 'Lower headrest', SW.y - 0.01075, SW.z + 0.0100],
    ];
    for (const [param, dir, glyph, hint, y, z] of buttons) {
      const b = new THREE.Group();
      b.position.set(face, y, z);
      add(b, part(rbox(0.0010, 0.0200, 0.0200, 0.0028, 2), M.stainless, LAYER.HARD, hint + ' button', { cast: false }), 0.0005, 0, 0);
      add(b, part(rbox(0.0016, 0.0168, 0.0168, 0.0022, 2), M.plastic, LAYER.HARD, hint + ' button', { cast: false }), 0.0012, 0, 0);
      add(b, part(glyphGeo, glyphMaterial(glyph), LAYER.HARD, hint + ' button', { cast: false }), 0.0023, 0, 0);
      group.add(b);
      controls.push({ object: b, id: `${controlsFor}:${param}:${dir}`, hint });
    }
    // USB-C port + status LED at the rear end of the panel
    P(rbox(0.0010, 0.0034, 0.0094, 0.0016, 2), M.stainless, LAYER.HARD, 'USB-C charging port', face + 0.0004, SW.y - 0.004, SW.z - 0.026, group, { cast: false });
    P(rbox(0.0010, 0.0020, 0.0078, 0.0009, 2), M.rubber, LAYER.HARD, 'USB-C charging port', face + 0.0008, SW.y - 0.004, SW.z - 0.026, group, { cast: false });
    P(new THREE.CylinderGeometry(0.0013, 0.0013, 0.0008, 16).rotateZ(Math.PI / 2), M.led, LAYER.HARD, 'Status LED', face + 0.0004, SW.y + 0.010, SW.z - 0.026, group, { cast: false });
    // PCB behind the panel
    P(rbox(0.010, 0.036, 0.080, 0.002), M.motor, LAYER.MECH, 'Switch panel PCB', W - 0.0115, SW.y, SW.z);
  }

  // ===== Frame (birch ply + kiln-dried beech) ===============================
  const WOOD = 'Kiln-dried beech rail', PLY = 'Birch plywood panel 15 mm';
  {
    const zf0 = 0.268, zf1 = 0.998, zl = zf1 - zf0, zc = (zf0 + zf1) / 2;
    // front block box
    P(rail(0.240, 0.015, zl), M.ply, LAYER.FRAME, 'Plywood base board 15 mm', CX, 0.1475, zc);
    for (const x of [0.0255, W - 0.0255]) P(plyYZ(zf0, zf1 - 0.015, 0.155, 0.56, 0.015, x, [rrect(0.33, 0.215, 0.92, 0.495, 0.03, 4)]), M.ply, LAYER.FRAME, PLY, 0, 0, 0);
    P(plyXY(0.033, W - 0.033, 0.155, 0.56, 0.015, 0.9905, [rrect(0.075, 0.215, W - 0.075, 0.47, 0.025, 4)]), M.ply, LAYER.FRAME, PLY, 0, 0, 0);
    for (const x of [0.0455, W - 0.0455]) {
      P(rail(0.025, 0.040, 0.70), M.wood, LAYER.FRAME, WOOD, x, 0.175, 0.632);
      P(rail(0.012, 0.030, 0.70), M.wood, LAYER.FRAME, WOOD, x < CX ? 0.039 : W - 0.039, 0.545, 0.632);
    }
    P(rail(0.164, 0.040, 0.025), M.wood, LAYER.FRAME, WOOD, CX, 0.175, 0.9705);
    P(rail(0.214, 0.040, 0.025), M.wood, LAYER.FRAME, WOOD, CX, 0.175, 0.2825);
    P(rail(0.214, 0.030, 0.030), M.wood, LAYER.FRAME, WOOD, CX, 0.545, 0.355);
    P(rail(0.214, 0.030, 0.035), M.wood, LAYER.FRAME, WOOD, CX, 0.545, 0.7175);
    P(rail(0.200, 0.020, 0.055), M.wood, LAYER.FRAME, 'Hinge mounting batten', CX, 0.598, 0.3325);
    for (const z of [0.43, 0.63]) P(rail(0.214, 0.020, 0.025), M.wood, LAYER.FRAME, 'Bin support batten', CX, 0.39, z);
    P(rail(0.214, 0.012, 0.248), M.ply, LAYER.FRAME, 'Plywood cup-holder deck', CX, 0.503, 0.859);
    for (const x of [0.044, W - 0.044]) {
      const cb = P(rail(0.03, 0.10, 0.03), M.wood, LAYER.FRAME, 'Glued corner block', x, 0.245, 0.975);
      cb.rotation.y = Math.PI / 4;
    }
    // rear bolster frame
    for (const x of [0.0505, W - 0.0505]) for (const z of [0.0375, 0.2175]) P(rail(0.035, 0.62, 0.035), M.wood, LAYER.FRAME, 'Hardwood post', x, 0.465, z);
    P(rail(0.244, 0.62, 0.012), M.ply, LAYER.FRAME, 'Plywood back panel 12 mm', CX, 0.465, 0.014);
    for (const x of [0.0255, W - 0.0255]) P(plyYZ(0.02, 0.255, 0.155, 0.775, 0.015, x, [rrect(0.075, 0.215, 0.20, 0.715, 0.03, 4)]), M.ply, LAYER.FRAME, PLY, 0, 0, 0);
    for (const z of [0.0375, 0.2175]) P(rail(0.144, 0.025, 0.035), M.wood, LAYER.FRAME, WOOD, CX, 0.7625, z);
    P(rail(0.244, 0.015, 0.235), M.ply, LAYER.FRAME, 'Plywood base board 15 mm', CX, 0.1475, 0.1375);
    P(rail(0.214, 0.45, 0.012), M.ply, LAYER.FRAME, PLY, CX, 0.38, 0.247);
    // elastic webbing across the leaning upper front of the bolster
    for (const x of [0.10, 0.18]) {
      const yc = 0.695, s = P(rail(0.045, 0.17, 0.003), M.webbing, LAYER.SPRING, 'Elastic webbing', x, yc, rearFrontZ(yc) - 0.034);
      s.rotation.x = -DIM.backLean;
    }
  }

  // ===== Foam ===============================================================
  {
    const F = 'HR foam 35 kg/m³';
    for (const x of [0.0105, W - 0.0105]) P(rail(0.014, 0.40, 0.70), M.foam, LAYER.FOAM, F, x, 0.36, 0.635);
    P(rail(0.20, 0.40, 0.014), M.foam, LAYER.FOAM, F, CX, 0.36, 1.0095);
    const fo = rrect(0.008, 0.31, W - 0.008, DEPTH - 0.008, 0.02, 6);
    const fh = [rrect(OW.x0 - 0.004, OW.z0 - 0.004, OW.x1 + 0.004, OW.z1 + 0.004, 0.012, 4), ...CUP_Z.map((z) => circle(CX, z, CUP_WALL + 0.004, 32))];
    P(slab(fo, fh, 0.576, 0.612, { smoothN: false, uv: false }), M.foam, LAYER.FOAM, 'HR foam topper 35 kg/m³', 0, 0, 0, padG);
    for (const x of [0.0105, W - 0.0105]) P(rail(0.014, 0.60, 0.24), M.foam, LAYER.FOAM, F, x, 0.47, 0.14);
    const ff = P(rail(0.24, 0.16, 0.016), M.foam, LAYER.FOAM, F, CX, 0.70, rearFrontZ(0.70) - 0.013);
    ff.rotation.x = -DIM.backLean;
    P(rail(0.25, 0.064, 0.235), M.foam, LAYER.FOAM, F, CX, 0.818, 0.125, rearPadG);
    P(rail(0.258, 0.004, 0.245), M.fibre, LAYER.FOAM, 'Dacron fibre wrap', CX, 0.852, 0.128, rearPadG);
  }

  // ===== Mechanism: hinges, soft-close stay, power hub, wiring ==============
  {
    const barrel = new THREE.CylinderGeometry(0.0035, 0.0035, 0.030, 14).rotateZ(Math.PI / 2);
    for (const x of [0.085, W - 0.085]) {
      P(barrel, M.steel, LAYER.MECH, 'Steel lid hinge', x, AX_Y, AX_Z);
      P(rbox(0.028, 0.0016, 0.036, 0.0006, 1), M.steel, LAYER.MECH, 'Steel lid hinge', x, 0.6155, AX_Z - 0.019);
      const leaf = P(rbox(0.028, 0.0016, 0.042, 0.0006, 1), M.steel, LAYER.MECH, 'Steel lid hinge', x, -0.010, 0.024, lidHinge);
      leaf.rotation.x = -0.32;
    }
  }
  // Soft-close gas stay along the left inner wall of the bin.
  const STAY_X = BIN.x0 + BIN.t + 0.0075;
  const stayA = V3(STAY_X, 0.470, 0.520);              // fixed pivot on the bin wall
  const stayBLocal = V3(STAY_X, -0.046, 0.055);         // pivot on the lid bracket (hinge-local)
  const stayB = V3(), stayM = V3();
  const STAY_LABEL = 'Soft-close lid stay (gas damper)';
  const stayBody = P(new THREE.CylinderGeometry(0.0065, 0.0065, 1, 16), M.motor, LAYER.MECH, STAY_LABEL, 0, 0, 0);
  const stayRod = P(new THREE.CylinderGeometry(0.0026, 0.0026, 1, 10), M.chrome, LAYER.MECH, STAY_LABEL, 0, 0, 0);
  const eyeGeo = new THREE.SphereGeometry(0.0055, 12, 8);
  P(eyeGeo, M.steel, LAYER.MECH, STAY_LABEL, stayA.x, stayA.y, stayA.z);
  P(rbox(0.002, 0.024, 0.024, 0.0008, 1), M.steel, LAYER.MECH, STAY_LABEL, BIN.x0 + BIN.t + 0.001, stayA.y, stayA.z);
  P(eyeGeo, M.steel, LAYER.MECH, STAY_LABEL, stayBLocal.x, stayBLocal.y, stayBLocal.z, lidHinge);
  P(rbox(0.010, 0.014, 0.020, 0.001, 1), M.steel, LAYER.MECH, STAY_LABEL, stayBLocal.x, -0.039, 0.055, lidHinge);

  // Power hub & transformer below the bin, with looms to the recliner motors.
  {
    const HUB = 'Power hub & 29 V transformer';
    P(rbox(0.120, 0.058, 0.170, 0.006, 2), M.motor, LAYER.MECH, HUB, CX, 0.186, 0.530);
    P(new THREE.TorusGeometry(0.024, 0.010, 10, 28).rotateX(Math.PI / 2), M.motor, LAYER.MECH, HUB, CX - 0.02, 0.225, 0.485);
    for (let i = 0; i < 6; i++) P(rail(0.07, 0.014, 0.0018), M.steel, LAYER.MECH, HUB, CX + 0.022, 0.222, 0.555 + i * 0.009);
    P(new THREE.SphereGeometry(0.002, 8, 6), M.led, LAYER.MECH, HUB, CX + 0.061, 0.20, 0.47, group, { cast: false });
    const cab = (pts, label, r = 0.0032) => P(tube(pts.map(([x, y, z]) => V3(x, y, z)), r, pts.length * 10, false, 6), M.rubber, LAYER.MECH, label, 0, 0, 0, group, { cast: false });
    const L = 'Cable loom to recliner motors';
    cab([[0.200, 0.180, 0.50], [0.235, 0.172, 0.505], [0.262, 0.168, 0.52], [0.276, 0.168, 0.53]], L, 0.0038);
    cab([[0.200, 0.195, 0.56], [0.235, 0.182, 0.56], [0.262, 0.176, 0.55], [0.276, 0.176, 0.545]], L, 0.0038);
    P(rbox(0.008, 0.022, 0.026, 0.002), M.plastic, LAYER.MECH, 'Motor plug (to recliner A / B)', 0.2745, 0.172, 0.537);
    cab([[0.19, 0.205, 0.61], [0.225, 0.26, 0.69], [0.238, 0.40, 0.80], [0.250, 0.49, 0.85], [0.262, 0.512, 0.86]], 'Switch panel lead', 0.0025);
    cab([[0.11, 0.214, 0.46], [0.11, 0.30, 0.372], [0.125, 0.48, 0.371], [0.14, 0.548, 0.372], [0.14, 0.548, 0.379]], 'USB & Qi charger lead', 0.0025);
    cab([[0.15, 0.214, 0.56], [0.15, 0.32, 0.545], [0.15, 0.398, 0.545], [0.15, 0.405, 0.545]], 'USB & Qi charger lead', 0.0025);
    cab([[0.17, 0.214, 0.61], [0.18, 0.34, 0.70], [0.195, 0.48, 0.80], [0.19, 0.509, 0.86], [0.175, 0.509, 0.925]], 'LED driver lead', 0.0022);
    cab([[0.085, 0.175, 0.46], [0.07, 0.165, 0.34], [0.07, 0.160, 0.16], [0.08, 0.150, 0.04], [0.085, 0.137, 0.012]], 'Mains input lead', 0.0035);
  }

  // ===== Pose ===============================================================
  function pose() {
    const e = smooth(params.explode);
    const ang = -LID_OPEN * params.lid;
    lidHinge.rotation.x = ang;
    lidPivot.rotation.x = ang;
    lidPivot.position.set(0, AX_Y + EX.lid * e, AX_Z);
    padG.position.y = EX.pad * e;
    rearPadG.position.y = EX.rearPad * e;

    // gas stay: fixed end A, moving end B follows the (un-exploded) lid
    const c = Math.cos(ang), s = Math.sin(ang);
    stayB.set(stayBLocal.x, AX_Y + stayBLocal.y * c - stayBLocal.z * s, AX_Z + stayBLocal.y * s + stayBLocal.z * c);
    const len = stayA.distanceTo(stayB);
    const bodyLen = Math.min(0.105, len - 0.012);
    stayM.subVectors(stayB, stayA).multiplyScalar(bodyLen / len).add(stayA);
    aimCyl(stayBody, stayA, stayM);
    stayM.subVectors(stayB, stayA).multiplyScalar((bodyLen - 0.01) / len).add(stayA);
    aimCyl(stayRod, stayM, stayB);

    // mugs drop in from ~10 cm above, one after the other
    const on = params.cups > 1e-4;
    mugs.forEach((g, i) => {
      const t = phase(params.cups, i * 0.15, 0.85 + i * 0.15);
      g.position.y = mugSeat + (1 - t) * CUP_DROP;
      g.traverse((o) => { if (o.isMesh) { o.visible = on; o.userData.hiddenByState = !on; } });
    });
  }

  pose();

  return {
    name: 'console',
    group,
    width: W,
    depth: DEPTH,
    params,
    set(param, value) {
      if (!(param in params)) return;
      params[param] = clamp01(+value || 0);
      pose();
    },
    controls,
    seats: [],
  };
}
