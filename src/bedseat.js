// bedseat.js — the single seat between the chaise and the console.
// Looks like the other seats (slim base box, plush seat cushion, tall back with
// a lumbar / headrest split) but hides a FRIHETEN-style pull-out bed:
//   bed 0 → 0.65  an upholstered trundle platform slides forward on 3-section
//                 telescopic runners until its front is flush with the chaise
//                 (z = 1.72), staying just under the seat deck;
//   bed 0.65 → 1  it rises on scissor brackets while a spring-loaded U-frame of
//                 pop-up legs swings down to the floor, until its padded top is
//                 level with the seat cushion (y = 0.45).
//   head 0 → 1    the headrest roll tilts forward on ratchet hinges (25°).
//   explode       cushions / topper / bed front panel float off the frame.
import * as THREE from 'three';
import {
  DIM, LAYER, part, at, softBox, rbox, rail, tube, sinuousSpring, taperedLeg, worldUV, clamp01, phase, smooth,
} from './core.js';
import { M } from './materials.js';

const W = DIM.W.bedseat;                 // 0.88
const Y0 = DIM.legH;                     // 0.13 underside of the base box
const YT = DIM.baseTop;                  // 0.28 top of the base box / seat deck
const TRAVEL = 0.72;                     // trundle slide: front face 1.00 → 1.72
const TOPPER_TOP = 0.254;                // stored height of the topper's crown
const LIFT = DIM.seatH - TOPPER_TOP;     // 0.196 rise to seat height
const HEAD_MAX = THREE.MathUtils.degToRad(25);
const LEAN = DIM.backLean;

// scissor bracket geometry (constant-x planes, one pair per side)
const SC_L = 0.40;                       // arm length (pivot to pivot)
const SC_ZF = 0.36;                      // fixed pivots (platform-local z, stored)
const SC_YB = 0.150;                     // bottom pivots on the inner runner
const SC_YT = 0.164;                     // top pivots on the platform side rail (stored)
// pop-up legs
const PL_PIV_Y = 0.152, PL_PIV_Z = 0.925;  // pivot (platform-local, stored)
const PL_GLIDE = 0.012;                  // swivel glide: leg end → floor contact
const PL_LEN = PL_PIV_Y + LIFT - PL_GLIDE; // 0.336, vertical at full lift
const PL_X = [0.088, W - 0.088];

// ---------------------------------------------------------------------------
// local helpers
// ---------------------------------------------------------------------------
// Upholstered block whose OUTER extents (including crown / bulge) are exactly
// x0..x1, y0..y1, z0..z1.
function soft(mat, layer, label, x0, x1, y0, y1, z0, z1, o = {}) {
  const bulge = o.bulge || 0, puff = o.puff || 0, pb = o.puffBottom || 0, pz = o.puffZ || 0;
  const w = x1 - x0 - 2 * bulge, h = y1 - y0 - puff - pb, d = z1 - z0 - 2 * bulge - pz;
  const m = part(softBox(w, h, d, o), mat, layer, label);
  m.position.set((x0 + x1) / 2, y0 + pb + h / 2, z0 + bulge + d / 2);
  return m;
}
// Hard block between bounds (rounded if r > 0). uv>0 → metre-based UVs (wood grain).
function blk(mat, layer, label, x0, x1, y0, y1, z0, z1, r = 0, uv = 0) {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0;
  const g = r > 0 ? rbox(w, h, d, Math.min(r, w / 2, h / 2, d / 2), 1) : rail(w, h, d);
  if (uv) worldUV(g, uv);
  return at(part(g, mat, layer, label), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}
// Cylinder along x between xa and xb.
function xCyl(r, xa, xb, y, z, mat, layer, label, seg = 12) {
  const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
  const g = new THREE.CylinderGeometry(r, r, x1 - x0, seg);
  g.rotateZ(Math.PI / 2);
  return at(part(g, mat, layer, label), (x0 + x1) / 2, y, z);
}
// Cylinder along z of length len, centred.
function zCylGeo(r, len, seg = 12) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateX(Math.PI / 2);
  return g;
}
// Lean the FRONT face of a centred softBox back by dz, ramping in from yStart to
// yEnd (world y = cy + local y). Front/back rounded bands move rigidly, only the
// flat middle is compressed, so the top keeps a clean round roll.
function leanFront(g, cy, d, r, yStart, yEnd, dz) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + cy, z = p.getZ(i);
    const t = clamp01((y - yStart) / (yEnd - yStart));
    const f = clamp01((z + d / 2 - r) / (d - 2 * r));
    p.setZ(i, z - dz * t * f);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  worldUV(g);
  return g;
}
// A flat fabric strap loop (pull strap / tab). Path in the (z, y) plane, the
// strap width runs along x.
function strapGeo(pts, width, thick = 0.0024) {
  const g = tube(pts.map(([z, y]) => new THREE.Vector3(0, y, z)), thick, 32, false, 10);
  g.scale(width / 2 / thick, 1, 1);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
export function createBedSeat() {
  const group = new THREE.Group();
  group.name = 'bedseat';
  const add = (o, parent = group) => { parent.add(o); return o; };

  // =========================================================================
  // FIXED UPHOLSTERY
  // =========================================================================
  // Outer back panel: 15 cm deep at the base, its front face leaning back above
  // the seat so the 9°-raked back cushions rest against it.
  {
    const h = DIM.backShellTop - Y0, d = DIM.backShellT, r = 0.035, cy = Y0 + h / 2;
    const g = leanFront(softBox(W, h, d, { r }), cy, d, r, 0.30, DIM.backShellTop, 0.08);
    add(at(part(g, M.fabric, LAYER.SHELL, 'Outer back panel (upholstered)'), W / 2, cy, d / 2));
  }
  // Base box sides (thin — the trundle uses almost the whole width).
  const SIDE_T = 0.022;
  for (const [x0, x1] of [[0, SIDE_T], [W - SIDE_T, W]]) {
    add(soft(M.fabric, LAYER.SHELL, 'Base side panel (upholstered)', x0, x1, Y0, YT, DIM.backShellT, DIM.baseFront, { r: 0.008, edgeSeg: 3 }));
  }
  // Upholstered cover over the raised front beam (the band above the bed front).
  add(soft(M.fabric, LAYER.SHELL, 'Front beam cover (upholstered)', SIDE_T, W - SIDE_T, 0.256, YT - 0.0005, 0.93, DIM.baseFront, { r: 0.009, edgeSeg: 3 }));
  // Deck cloth over the springs and dust cover behind the trundle bay.
  add(blk(M.fabric, LAYER.SHELL, 'Deck cloth over springs', SIDE_T, W - SIDE_T, 0.2775, 0.279, DIM.backShellT, 0.93));
  add(blk(M.underside, LAYER.SHELL, 'Dust cover', SIDE_T, W - SIDE_T, 0.1305, 0.1325, DIM.backShellT, 0.305));

  // Seat cushion: x 0.006→0.874, z 0.32→1.02, top 0.45. Internals are siblings
  // (not children) so they stay visible when the cover is hidden.
  const seatG = add(new THREE.Group());
  add(soft(M.fabric, LAYER.CUSHION, 'Seat cushion', 0.006, W - 0.006, YT, DIM.seatH, DIM.backCushFrontZ, DIM.depth,
    { r: 0.055, puff: 0.012, bulge: 0.006, edgeSeg: 5 }), seatG);
  add(blk(M.foam, LAYER.FOAM, 'HR foam core 35 kg/m³', 0.035, W - 0.035, 0.30, 0.42, 0.35, 0.99, 0.02), seatG);
  add(blk(M.fibre, LAYER.FOAM, 'Polyester fibre wrap', 0.018, W - 0.018, 0.289, 0.437, 0.332, 1.008, 0.04), seatG);

  // Back: a raked group whose origin is the back cushion's front face at seat
  // height. Lumbar section + separate headrest roll on ratchet hinges.
  const backG = add(new THREE.Group());
  backG.position.set(0, DIM.seatH, DIM.backCushFrontZ);
  backG.rotation.x = -LEAN;
  const T = DIM.backCushT;                                        // 0.17
  const SEAM_L = (DIM.headSeamY - DIM.seatH) / Math.cos(LEAN);    // local y of the seam (front face)
  const TOP_L = 0.535;                                            // local y of the top (→ y≈0.98)
  const lumbarG = add(new THREE.Group(), backG);
  add(soft(M.fabric, LAYER.CUSHION, 'Back cushion — lumbar section', 0.012, W - 0.012, -0.14, SEAM_L - 0.003, -T, 0.0,
    { r: 0.05, puffZ: 0.018, bulge: 0.005, edgeSeg: 5 }), lumbarG);
  add(blk(M.foam, LAYER.FOAM, 'HR foam back block', 0.04, W - 0.04, -0.115, SEAM_L - 0.03, -T + 0.03, -0.025, 0.02), lumbarG);
  // headrest hinge axis (backG local), near the front so the roll's lower edge
  // stays on top of the lumbar section as it tilts.
  const HP_Y = SEAM_L + 0.004, HP_Z = -0.055;
  const headG = add(new THREE.Group(), backG);
  headG.position.set(0, HP_Y, HP_Z);
  const headCushG = add(new THREE.Group(), headG);
  add(soft(M.fabric, LAYER.CUSHION, 'Adjustable headrest roll', 0.012, W - 0.012, 0.0, TOP_L - HP_Y, -T - HP_Z, -HP_Z,
    { r: 0.062, puffZ: 0.014, bulge: 0.005, edgeSeg: 6 }), headCushG);
  add(blk(M.foam, LAYER.FOAM, 'Memory-foam headrest pad', 0.04, W - 0.04, 0.02, TOP_L - HP_Y - 0.03, -T - HP_Z + 0.035, -HP_Z - 0.025, 0.02), headCushG);
  // core board just behind the hinge axis (stays on the hinges when exploded)
  add(blk(M.ply, LAYER.FRAME, 'Headrest core board — ply 9 mm', 0.05, W - 0.05, 0.025, TOP_L - HP_Y - 0.045, -0.034, -0.025), headG);

  // =========================================================================
  // FIXED FRAME (base + back)
  // =========================================================================
  const woodUV = 0.35;
  for (const [x0, x1] of [[0.004, 0.019], [W - 0.019, W - 0.004]]) {
    add(blk(M.ply, LAYER.FRAME, 'Birch-ply side cheek 15 mm', x0, x1, 0.135, 0.276, 0.155, 0.995));
  }
  add(blk(M.wood, LAYER.FRAME, 'Kiln-dried hardwood rear seat rail', 0.019, W - 0.019, 0.15, 0.275, 0.155, 0.19, 0, woodUV));
  add(blk(M.wood, LAYER.FRAME, 'Raised front beam — laminated beech (no rail below: trundle bay)', SIDE_T, W - SIDE_T, 0.259, 0.2765, 0.935, 0.99, 0, woodUV));
  for (const s of [0, 1]) {
    const x0 = s ? W - 0.065 : 0.019, x1 = s ? W - 0.019 : 0.065;
    add(blk(M.wood, LAYER.FRAME, 'Glued corner block', x0, x1, 0.259, 0.2765, 0.885, 0.935, 0, woodUV));
    add(blk(M.wood, LAYER.FRAME, 'Glued corner block', x0, x1, 0.215, 0.275, 0.19, 0.235, 0, woodUV));
  }
  // back frame inside the outer back panel
  for (const [x0, x1] of [[0.012, 0.040], [W - 0.040, W - 0.012]]) {
    add(blk(M.wood, LAYER.FRAME, 'Back frame post (hardwood)', x0, x1, 0.14, 0.885, 0.014, 0.058, 0, woodUV));
  }
  add(blk(M.wood, LAYER.FRAME, 'Back frame top rail', 0.040, W - 0.040, 0.845, 0.885, 0.014, 0.058, 0, woodUV));
  add(blk(M.wood, LAYER.FRAME, 'Headrest hinge rail', 0.040, W - 0.040, 0.732, 0.772, 0.014, 0.058, 0, woodUV));
  add(blk(M.wood, LAYER.FRAME, 'Back frame bottom rail', 0.040, W - 0.040, 0.14, 0.20, 0.014, 0.058, 0, woodUV));
  add(blk(M.ply, LAYER.FRAME, 'Plywood back panel 6 mm', 0.040, W - 0.040, 0.20, 0.845, 0.007, 0.013));
  // elastic webbing across the back frame
  for (const x of [0.17, 0.35, 0.53, 0.71]) {
    add(blk(M.webbing, LAYER.SPRING, 'Elastic webbing 50 mm', x - 0.025, x + 0.025, 0.20, 0.845, 0.0585, 0.061));
  }
  for (const y of [0.36, 0.53, 0.76]) {
    add(blk(M.webbing, LAYER.SPRING, 'Elastic webbing 50 mm', 0.040, W - 0.040, y - 0.025, y + 0.025, 0.0612, 0.0637));
  }
  // seat deck: sinuous springs from the rear rail to the raised front beam
  {
    const z0 = 0.19, z1 = 0.935, ys = 0.2733;
    const sg = sinuousSpring(z1 - z0, 0.022, 10);
    const clipG = rbox(0.03, 0.008, 0.022, 0.002);
    for (let i = 0; i < 6; i++) {
      const x = 0.105 + i * 0.134;
      add(at(part(sg, M.spring, LAYER.SPRING, 'Sinuous S-springs'), x, ys, z0));
      add(at(part(clipG, M.steel, LAYER.MECH, 'Spring clip'), x, ys, z0 + 0.011));
      add(at(part(clipG, M.steel, LAYER.MECH, 'Spring clip'), x, ys, z1 - 0.011));
    }
    for (const z of [0.44, 0.69]) add(xCyl(0.0016, 0.08, W - 0.08, ys + 0.0035, z, M.spring, LAYER.SPRING, 'Lateral spring tie wire', 6));
  }

  // headrest ratchet hinges: fixed leaf runs level from the hinge rail through
  // the top of the lumbar section to the knuckle on the headrest axis; the
  // moving leaf rises from the knuckle along the headrest core board.
  {
    backG.updateMatrixWorld(true);
    const knW = new THREE.Vector3(0, HP_Y, HP_Z).applyMatrix4(backG.matrixWorld);
    const railPt = backG.worldToLocal(new THREE.Vector3(0, knW.y, 0.06));
    for (const x of [0.22, W - 0.22]) {
      add(blk(M.steel, LAYER.MECH, 'Ratchet hinge mounting plate', x - 0.022, x + 0.022, knW.y - 0.03, knW.y + 0.03, 0.058, 0.0615, 0.001));
      const lower = part(new THREE.BoxGeometry(0.006, 0.026, 1), M.steel, LAYER.MECH, 'Ratchet headrest hinge — fixed leaf');
      aimBarLocal(lower, new THREE.Vector3(x, railPt.y, railPt.z), new THREE.Vector3(x, HP_Y, HP_Z));
      backG.add(lower);
      const knuckle = xCyl(0.014, x - 0.02, x + 0.02, 0, 0, M.motor, LAYER.MECH, 'Ratchet headrest hinge (6-click)', 18);
      headG.add(knuckle);
      add(xCyl(0.0045, x - 0.026, x + 0.026, 0, 0, M.chrome, LAYER.MECH, 'Ratchet hinge pin'), headG);
      const upper = part(new THREE.BoxGeometry(0.006, 0.026, 1), M.steel, LAYER.MECH, 'Ratchet headrest hinge — moving leaf');
      aimBarLocal(upper, new THREE.Vector3(x, 0.0, -0.012), new THREE.Vector3(x, 0.15, -0.022));
      headG.add(upper);
    }
  }

  // legs: slim tapered gunmetal, slightly splayed. Front pair sits on steel
  // brackets under the side cheeks (the trundle bay is open above them).
  // (raised 2.5 mm: the shared taperedLeg's tilted glide rim otherwise dips
  // ~2 mm below the floor; the mounting plate tucks into the base instead)
  const LEG_X = [0.045, W - 0.045], LEG_Z = [0.075, 0.93], LEG_RAISE = 0.0025;
  for (const x of LEG_X) for (const z of LEG_Z) {
    const left = x < W / 2, front = z > 0.5;
    add(at(taperedLeg(DIM.legH, { splayX: left ? 0.07 : -0.07, splayZ: front ? -0.1 : 0.1, label: 'Tapered steel leg' }), x, Y0 + LEG_RAISE, z));
  }
  for (const s of [0, 1]) {
    const x0 = s ? W - 0.085 : 0.004, x1 = s ? W - 0.004 : 0.085;
    add(blk(M.steel, LAYER.HARD, 'Leg mounting bracket', x0, x1, 0.1305, 0.1338, 0.895, 0.965, 0.001));
  }

  // =========================================================================
  // PULL-OUT BED
  // =========================================================================
  // outer runner rails (fixed to the side cheeks), intermediate (half travel),
  // inner (full travel, carries the scissor brackets) — 3-section over-travel.
  const RUN_Z0 = 0.31, RUN_Z1 = 0.96;
  const midG = add(new THREE.Group());
  const slideG = add(new THREE.Group());
  const platG = add(new THREE.Group(), slideG);
  const mx = (s, x) => (s ? W - x : x);
  for (const s of [0, 1]) {
    const x = (a, b) => [mx(s, a), mx(s, b)].sort((p, q) => p - q);
    add(blk(M.steel, LAYER.HARD, 'Telescopic runner — outer rail', ...x(0.0222, 0.0257), 0.137, 0.169, RUN_Z0, RUN_Z1, 0.0012));
    add(blk(M.chrome, LAYER.HARD, 'Telescopic runner — intermediate rail', ...x(0.0257, 0.0287), 0.1405, 0.1655, RUN_Z0, RUN_Z1, 0.001), midG);
    add(blk(M.steel, LAYER.HARD, 'Telescopic runner — inner rail', ...x(0.0287, 0.0317), 0.143, 0.163, RUN_Z0, RUN_Z1, 0.001), slideG);
  }

  // ---- platform (moves with slideG in z, rises in platG) -------------------
  // steel frame
  for (const s of [0, 1]) {
    const [x0, x1] = [mx(s, 0.046), mx(s, 0.066)].sort((p, q) => p - q);
    add(blk(M.steel, LAYER.HARD, 'Steel bed frame — side rail', x0, x1, 0.142, 0.173, 0.31, 0.968, 0.002), platG);
  }
  for (const [z0, z1] of [[0.31, 0.33], [0.48, 0.50], [0.948, 0.968]]) {
    add(blk(M.steel, LAYER.HARD, 'Steel bed frame — cross rail', 0.066, W - 0.066, 0.142, 0.160, z0, z1, 0.002), platG);
  }
  add(blk(M.ply, LAYER.FRAME, 'Bed deck — birch ply 12 mm', 0.066, W - 0.066, 0.161, 0.173, 0.312, 0.966), platG);
  // ventilation slots in the deck read as a slatted deck
  for (let i = 0; i < 7; i++) {
    const z = 0.37 + i * 0.085;
    add(blk(M.wood, LAYER.FRAME, 'Bed deck slat', 0.07, W - 0.07, 0.1735, 0.1738, z - 0.018, z + 0.018), platG);
  }
  // topper (own group so it can float off in the exploded view)
  const topperG = add(new THREE.Group(), platG);
  add(soft(M.fabric, LAYER.CUSHION, 'Bed topper — quilted cover', 0.024, W - 0.024, 0.174, TOPPER_TOP, 0.31, 0.966,
    { r: 0.03, puff: 0.006, bulge: 0.003, edgeSeg: 4 }), topperG);
  add(blk(M.foam, LAYER.FOAM, 'Memory-foam topper core 7 cm', 0.04, W - 0.04, 0.181, 0.247, 0.325, 0.952, 0.015), topperG);
  // front panel = the base's front face when stored
  const frontG = add(new THREE.Group(), platG);
  add(soft(M.fabric, LAYER.SHELL, 'Bed front panel (upholstered)', SIDE_T, W - SIDE_T, 0.135, 0.249, 0.968, DIM.baseFront, { r: 0.012, edgeSeg: 3 }), frontG);
  add(blk(M.ply, LAYER.FRAME, 'Front panel board — ply 15 mm', 0.035, W - 0.035, 0.142, 0.242, 0.972, 0.987), platG);
  // recessed pull strap (the bed control)
  const strap = new THREE.Group();
  {
    const cx = W / 2, cy = 0.198, z = DIM.baseFront;
    const pocket = part(rbox(0.13, 0.05, 0.004, 0.0019, 3), M.seam, LAYER.HARD, 'Recessed strap pocket');
    pocket.position.set(cx, cy, z - 0.0012);
    const loop = part(strapGeo([[-0.004, 0.017], [0.005, 0.016], [0.0105, 0.007], [0.0115, -0.004], [0.0065, -0.014], [-0.004, -0.018]], 0.075), M.seam, LAYER.HARD, 'Fabric pull strap');
    loop.position.set(cx, cy, z);
    strap.add(pocket, loop);
  }
  frontG.add(strap);

  // ---- scissor brackets ------------------------------------------------------
  const armGeo = rbox(0.004, 0.014, SC_L + 0.014, 0.0019, 2);
  const pinGeoS = new THREE.CylinderGeometry(0.0045, 0.0045, 1, 10).rotateZ(Math.PI / 2);
  const scissors = [];
  for (const s of [0, 1]) {
    const xA = mx(s, 0.034), xB = mx(s, 0.039);
    const armA = add(at(part(armGeo, M.steel, LAYER.HARD, 'Scissor lift bracket'), xA, 0, 0), slideG);
    const armB = add(at(part(armGeo, M.steel, LAYER.HARD, 'Scissor lift bracket'), xB, 0, 0), slideG);
    const pin = (xa, xb, parent, label) => {
      const m = part(pinGeoS, M.chrome, LAYER.HARD, label);
      m.scale.x = Math.abs(xb - xa); m.position.x = (xa + xb) / 2;
      return add(m, parent);
    };
    const cPin = pin(mx(s, 0.0318), mx(s, 0.0428), slideG, 'Scissor centre pivot');
    const bFix = pin(mx(s, 0.0287), mx(s, 0.038), slideG, 'Scissor pivot — runner');
    bFix.position.set(bFix.position.x, SC_YB, SC_ZF);
    const bSlide = pin(mx(s, 0.0300), mx(s, 0.0425), slideG, 'Scissor slide pin — runner');
    const tFix = pin(mx(s, 0.0355), mx(s, 0.047), platG, 'Scissor pivot — bed frame');
    tFix.position.set(tFix.position.x, SC_YT, SC_ZF);
    const tSlide = pin(mx(s, 0.0322), mx(s, 0.047), slideG, 'Scissor slide pin — bed frame');
    // slot guides
    const [gx0, gx1] = [mx(s, 0.043), mx(s, 0.046)].sort((p, q) => p - q);
    add(blk(M.steel, LAYER.HARD, 'Scissor slide slot (bed frame)', gx0, gx1, SC_YT - 0.0095, SC_YT + 0.008, SC_ZF + 0.31, SC_ZF + SC_L + 0.02, 0.001), platG);
    const [hx0, hx1] = [mx(s, 0.0317), mx(s, 0.0345)].sort((p, q) => p - q);
    add(blk(M.steel, LAYER.HARD, 'Scissor slide shoe (runner)', hx0, hx1, SC_YB - 0.007, SC_YB + 0.003, SC_ZF + 0.31, SC_ZF + SC_L + 0.02, 0.001), slideG);
    scissors.push({ armA, armB, cPin, bSlide, tSlide });
  }

  // ---- pop-up leg frame (spring loaded U-frame) ---------------------------------
  const legG = add(new THREE.Group(), platG);
  legG.position.set(0, PL_PIV_Y, PL_PIV_Z);
  const glides = [];
  {
    const legGeo = zCylGeo(0.0085, PL_LEN, 14);
    for (const x of PL_X) {
      add(at(part(legGeo, M.steel, LAYER.HARD, 'Pop-up leg (spring loaded)'), x, 0, -PL_LEN / 2), legG);
      // torsion spring around the axle
      const coil = [];
      for (let i = 0; i <= 48; i++) {
        const a = i / 48 * Math.PI * 2 * 4;
        coil.push(new THREE.Vector3((i / 48 - 0.5) * 0.022, Math.cos(a) * 0.0115, Math.sin(a) * 0.0115));
      }
      const xs = x < W / 2 ? x + 0.022 : x - 0.022;
      add(at(part(tube(coil, 0.0016, 96, false, 5), M.spring, LAYER.HARD, 'Torsion spring (pop-up leg)'), xs, 0, 0), legG);
      // swivel glide stays level (counter-rotated in pose())
      const gG = add(new THREE.Group(), legG);
      gG.position.set(x, 0, -PL_LEN);
      add(part(new THREE.SphereGeometry(0.0085, 14, 10), M.steel, LAYER.HARD, 'Swivel glide ball joint'), gG);
      add(at(part(new THREE.CylinderGeometry(0.017, 0.018, 0.008, 20), M.rubber, LAYER.HARD, 'Swivel floor glide'), 0, -PL_GLIDE + 0.004, 0), gG);
      glides.push(gG);
      // pivot bracket on the frame side rail
      const [bx0, bx1] = x < W / 2 ? [0.066, 0.0695] : [W - 0.0695, W - 0.066];
      add(blk(M.steel, LAYER.HARD, 'Pop-up leg hinge bracket', bx0, bx1, 0.138, 0.160, PL_PIV_Z - 0.022, PL_PIV_Z + 0.022, 0.001), platG);
    }
    add(xCyl(0.0075, PL_X[0], PL_X[1], 0, -PL_LEN + 0.035, M.steel, LAYER.HARD, 'Pop-up leg cross tube'), legG);
    add(xCyl(0.005, 0.066, W - 0.066, 0, 0, M.chrome, LAYER.HARD, 'Pop-up leg axle'), legG);
  }

  // =========================================================================
  // CONTROLS
  // =========================================================================
  // headrest pull loop: a short fabric loop sewn into the top seam of the roll.
  const headTab = new THREE.Group();
  {
    const yTop = TOP_L - HP_Y, zc = (-T - HP_Z + -HP_Z) / 2 + 0.006;
    const loop = part(strapGeo([[-0.016, -0.006], [-0.011, 0.006], [0.0, 0.011], [0.011, 0.006], [0.016, -0.006]], 0.048, 0.0026),
      M.seam, LAYER.HARD, 'Headrest pull loop');
    loop.position.set(W / 2, yTop, zc);
    headTab.add(loop);
  }
  headCushG.add(headTab);

  // =========================================================================
  // SEAT CAMERA
  // =========================================================================
  const anchor = new THREE.Object3D();
  anchor.name = 'bedseat-eye';
  group.add(anchor);

  // =========================================================================
  // POSE
  // =========================================================================
  const params = { bed: 0, head: 0, explode: 0 };
  // explode offsets (world-space intent, converted to backG-local once)
  const toBack = (v) => v.applyAxisAngle(new THREE.Vector3(1, 0, 0), LEAN);
  const EX_LUMBAR = toBack(new THREE.Vector3(0, 0.14, 0.05));
  const EX_HEAD = toBack(new THREE.Vector3(0, 0.27, 0.05));

  function pose() {
    const { bed, head: hd, explode: ex } = params;
    const sl = phase(bed, 0, 0.65);          // slide
    const lf = phase(bed, 0.65, 1);          // lift
    const slideZ = sl * TRAVEL, lift = lf * LIFT;
    slideG.position.z = slideZ;
    midG.position.z = slideZ * 0.5;
    platG.position.y = lift;

    // scissors: fixed pivots share z, sliding ends at zf + S
    const H = SC_YT + lift - SC_YB;
    const S = Math.sqrt(SC_L * SC_L - H * H);
    const ang = Math.atan2(H, S);
    const zc = SC_ZF + S / 2, yc = SC_YB + H / 2;
    for (const sc of scissors) {
      sc.armA.position.y = yc; sc.armA.position.z = zc; sc.armA.rotation.x = -ang;
      sc.armB.position.y = yc; sc.armB.position.z = zc; sc.armB.rotation.x = ang;
      sc.cPin.position.y = yc; sc.cPin.position.z = zc;
      sc.bSlide.position.y = SC_YB; sc.bSlide.position.z = SC_ZF + S;
      sc.tSlide.position.y = SC_YB + H; sc.tSlide.position.z = SC_ZF + S;
    }

    // pop-up legs: swing down as the platform rises; the glide never goes
    // below the floor and lands exactly as the lift completes.
    const pivY = PL_PIV_Y + lift;
    const free = (Math.PI / 2) * smooth(lf / 0.7);
    const floor = Math.asin(clamp01((pivY - PL_GLIDE) / PL_LEN));
    const phi = Math.min(free, floor);
    legG.rotation.x = -phi;
    for (const g of glides) g.rotation.x = phi;

    // headrest ratchet (rises a touch as it clicks forward)
    headG.rotation.x = hd * HEAD_MAX;
    headG.position.y = HP_Y + 0.006 * hd;

    // explode
    seatG.position.set(0, 0.25 * ex, 0.10 * ex);
    lumbarG.position.copy(EX_LUMBAR).multiplyScalar(ex);
    headCushG.position.copy(EX_HEAD).multiplyScalar(ex);
    const exOut = ex * phase(bed, 0.55, 0.65); // only once it is clear of the base
    topperG.position.set(0, 0.16 * exOut, 0.12 * exOut);
    frontG.position.z = 0.09 * ex;

    // seated eye: pushed forward a little by a tilted headrest
    anchor.position.set(W / 2, DIM.seatH + 0.68, 0.40 + 0.06 * hd);
    anchor.rotation.set(THREE.MathUtils.degToRad(6 + 4 * hd), 0, 0);
  }

  function set(param, value) {
    if (!(param in params)) return;
    params[param] = clamp01(Number(value) || 0);
    pose();
  }
  pose();

  return {
    name: 'bedseat',
    group,
    width: W,
    params,
    set,
    controls: [
      { object: strap, id: 'bedseat:bed:toggle', hint: 'Pull out bed' },
      { object: headTab, id: 'bedseat:head:toggle', hint: 'Tilt headrest' },
    ],
    seats: [{ id: 'bedseat', label: 'Single seat', anchor }],
  };
}

// Flat bar between two points in a constant-x plane (static use only).
function aimBarLocal(mesh, a, b) {
  const dir = b.clone().sub(a), len = dir.length();
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.scale.set(1, 1, Math.max(1e-4, len));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
}
