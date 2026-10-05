// recliner.js — power wall-hugger recliner with a lazy-tongs footrest.
// Motion (single motor, like a real power recliner):
//   recline 0 → 0.42  footrest unfolds on a two-stage scissor (lazy tongs), filler panel follows
//   recline 0.32 → 1  carriage slides forward 15 cm on swing links, seat tilts, back reclines +30°
//   head 0 → 1        power headrest tilts forward 25° about the lumbar/headrest seam
import * as THREE from 'three';
import { DIM, LAYER, part, softBox, rbox, rail, tube, sinuousSpring, taperedLeg, linkBar, aimBar, aimRod, rod, clamp01, lerp, phase } from './core.js';
import { M, glyphMaterial } from './materials.js';

const D2R = Math.PI / 180;

export function createRecliner({ id = 'reclinerA', rightArm = false } = {}) {
  const W = DIM.W.recliner, AW = DIM.W.arm;
  const width = rightArm ? W + AW : W;
  const cx = W / 2;
  const group = new THREE.Group();
  const params = { recline: 0, head: 0, explode: 0 };
  const add = (parent, m, x, y, z) => { m.position.set(x, y, z); parent.add(m); return m; };

  // =========================================================================
  // Static base (stays put; the carriage slides over it)
  // =========================================================================
  add(group, part(softBox(W - 0.012, 0.155, 0.95, { r: 0.03, bulge: 0.003 }), M.fabric, LAYER.SHELL, 'Upholstered base'), cx, 0.2075, 0.475);
  // rear plinth hides the gap under the back panel and is exposed when the carriage slides
  add(group, part(softBox(W - 0.012, 0.22, 0.17, { r: 0.03 }), M.fabric, LAYER.SHELL, 'Upholstered rear plinth'), cx, 0.24, 0.085);
  add(group, part(new THREE.BoxGeometry(W - 0.03, 0.004, 0.92), M.underside, LAYER.SHELL, 'Dust cover', { cast: false }), cx, 0.128, 0.475);
  group.add(part(tube([new THREE.Vector3(0.02, 0.284, 0.951), new THREE.Vector3(W - 0.02, 0.284, 0.951)], 0.0028, 4), M.seam, LAYER.DETAIL, 'Welt seam'));
  for (const [x, z, sx, sz] of [[0.07, 0.07, -0.1, -0.1], [W - 0.07, 0.07, 0.1, -0.1], [0.07, 0.74, -0.1, 0.05], [W - 0.07, 0.74, 0.1, 0.05]]) {
    add(group, taperedLeg(DIM.legH, { splayX: sx, splayZ: sz }), x, DIM.legH, z);
  }
  // base frame
  const wood = (parent, w, h, d, x, y, z, label = 'Kiln-dried hardwood rail') => add(parent, part(rail(w, h, d), M.wood, LAYER.FRAME, label), x, y, z);
  wood(group, W - 0.04, 0.1, 0.03, cx, 0.2, 0.025, 'Rear base rail');
  wood(group, W - 0.04, 0.05, 0.03, cx, 0.255, 0.93, 'Front base rail (above footrest opening)');
  wood(group, 0.03, 0.1, 0.9, 0.025, 0.2, 0.475, 'Base side rail');
  wood(group, 0.03, 0.1, 0.9, W - 0.025, 0.2, 0.475, 'Base side rail');
  for (const [x, z] of [[0.05, 0.055], [W - 0.05, 0.055], [0.05, 0.9], [W - 0.05, 0.9]]) wood(group, 0.045, 0.07, 0.045, x, 0.19, z, 'Glued & screwed corner block');
  // steel base rails the mechanism bolts to
  for (const x of [0.052, W - 0.052]) add(group, part(rbox(0.012, 0.035, 0.8, 0.002), M.steel, LAYER.MECH, 'Steel mechanism base rail'), x, 0.165, 0.47);
  const rearTube = add(group, part(new THREE.CylinderGeometry(0.011, 0.011, W - 0.1, 12), M.steel, LAYER.MECH, 'Motor mount cross tube'), cx, 0.17, 0.12);
  rearTube.rotation.z = Math.PI / 2;

  // =========================================================================
  // Carriage: seat + back + footrest; slides forward on swing links
  // =========================================================================
  const car = new THREE.Group();
  group.add(car);
  const seatPivot = add(car, new THREE.Group(), cx, 0.28, 0.33);
  const seat = add(seatPivot, part(softBox(W - 0.014, 0.17, 0.69, { r: 0.055, puff: 0.015, bulge: 0.007 }), M.fabric, LAYER.CUSHION, 'Seat cushion'), 0, 0.085, 0.345);
  const seatFoam = add(seatPivot, part(new THREE.BoxGeometry(W - 0.07, 0.13, 0.62), M.foam, LAYER.FOAM, 'HR foam 35 kg/m³ + fibre wrap'), 0, 0.085, 0.345);
  const seatPipe = add(seatPivot, part(tube([new THREE.Vector3(-W / 2 + 0.035, 0, 0), new THREE.Vector3(W / 2 - 0.035, 0, 0)], 0.0032, 4), M.seam, LAYER.DETAIL, 'Piping'), 0, 0.158, 0.686);
  // seat frame + springs
  wood(car, W - 0.1, 0.04, 0.03, cx, 0.255, 0.35, 'Seat frame rear rail');
  wood(car, W - 0.1, 0.04, 0.03, cx, 0.255, 0.9, 'Seat frame front rail');
  for (let i = 0; i < 5; i++) add(car, part(sinuousSpring(0.54, 0.017, 8), M.spring, LAYER.SPRING, 'Sinuous S-springs (no-sag)'), 0.11 + i * 0.11, 0.268, 0.36);
  // carriage side plates + cross tube
  for (const x of [0.07, W - 0.07]) add(car, part(rbox(0.006, 0.075, 0.68, 0.002), M.steel, LAYER.MECH, 'Seat carriage side plate'), x, 0.215, 0.57);
  const frontTube = add(car, part(new THREE.CylinderGeometry(0.011, 0.011, W - 0.13, 12), M.steel, LAYER.MECH, 'Footrest drive tube'), cx, 0.2, 0.84);
  frontTube.rotation.z = Math.PI / 2;
  for (const x of [0.045, W - 0.045]) add(car, part(rbox(0.006, 0.12, 0.06, 0.002), M.steel, LAYER.MECH, 'Footrest mounting bracket'), x, 0.2, 0.86);

  // swing links (wall-hugger): base rail ↔ carriage plate, both sides
  const swing = [];
  for (const x of [0.06, W - 0.06]) {
    for (const [bz, cz] of [[0.2, 0.3], [0.62, 0.72]]) {
      const bar = linkBar(new THREE.Vector3(), new THREE.Vector3(0, 0, 0.1), 0.024, 0.006, M.steel, LAYER.MECH, 'Wall-hugger swing link');
      group.add(bar);
      swing.push({ bar, a: new THREE.Vector3(x, 0.165, bz), c: new THREE.Vector3(x, 0.215, cz) });
    }
  }
  // linear actuator: housing pivots on the rear cross tube, rod pushes the carriage lever
  const motorPivot = new THREE.Vector3(cx, 0.17, 0.12);
  const housing = part(new THREE.CylinderGeometry(0.028, 0.028, 0.22, 16), M.motor, LAYER.MECH, 'Power recline motor (29 V DC, linear actuator)');
  const gearbox = part(rbox(0.07, 0.06, 0.06, 0.01), M.motor, LAYER.MECH, 'Motor gearbox');
  group.add(housing, gearbox);
  const actRod = rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.1, 0), 0.008, M.chrome, LAYER.MECH, 'Actuator rod');
  group.add(actRod);
  group.add(part(tube([new THREE.Vector3(cx - 0.03, 0.15, 0.1), new THREE.Vector3(cx - 0.15, 0.14, 0.06), new THREE.Vector3(0.02, 0.15, 0.05)], 0.004, 16), M.plastic, LAYER.MECH, 'Motor cable to power hub'));

  // =========================================================================
  // Back (pivots on the carriage) with power headrest
  // =========================================================================
  const PIV = new THREE.Vector3(cx, 0.42, 0.26);
  const back = add(car, new THREE.Group(), PIV.x, PIV.y, PIV.z);
  const rel = (y, z) => new THREE.Vector3(0, y - PIV.y, z - PIV.z);
  const lean = DIM.backLean;
  const backPanel = part(softBox(W - 0.004, 0.62, 0.15, { r: 0.045, bulge: 0.004 }), M.fabric, LAYER.SHELL, 'Upholstered back panel');
  backPanel.position.copy(rel(0.59, 0.075));
  back.add(backPanel);
  // lumbar cushion
  const lumbarC = rel(0.605, DIM.backCushFrontZ - 0.155 * Math.tan(lean) - DIM.backCushT / 2);
  const lumbar = part(softBox(W - 0.026, 0.315, DIM.backCushT, { r: 0.065, puffZ: 0.024, bulge: 0.009 }), M.fabric, LAYER.CUSHION, 'Lumbar cushion');
  lumbar.position.copy(lumbarC); lumbar.rotation.x = -lean; back.add(lumbar);
  const lumbarFoam = part(new THREE.BoxGeometry(W - 0.08, 0.26, 0.12), M.foam, LAYER.FOAM, 'Back foam, fibre wrapped');
  lumbarFoam.position.copy(lumbarC); lumbarFoam.rotation.x = -lean; back.add(lumbarFoam);
  // headrest on a hinge at the seam
  const seamZ = DIM.backCushFrontZ - (DIM.headSeamY - DIM.seatH) * Math.tan(lean);
  const headPivot = new THREE.Group();
  headPivot.position.copy(rel(DIM.headSeamY, seamZ - DIM.backCushT));
  back.add(headPivot);
  const headH = DIM.backH - DIM.headSeamY;
  const headC = new THREE.Vector3(0, (headH / 2) * Math.cos(lean), DIM.backCushT / 2 - (headH / 2) * Math.sin(lean));
  const headrest = part(softBox(W - 0.026, headH + 0.012, DIM.backCushT, { r: 0.075, puffZ: 0.02, puff: 0.012, bulge: 0.009 }), M.fabric, LAYER.CUSHION, 'Power headrest');
  headrest.position.copy(headC); headrest.rotation.x = -lean; headPivot.add(headrest);
  const headFoam = part(new THREE.BoxGeometry(W - 0.08, headH - 0.05, 0.12), M.foam, LAYER.FOAM, 'Headrest foam');
  headFoam.position.copy(headC); headFoam.rotation.x = -lean; headPivot.add(headFoam);
  for (const x of [-0.2, 0.2]) {
    const hinge = part(rbox(0.03, 0.08, 0.008, 0.002), M.steel, LAYER.MECH, 'Headrest hinge plate');
    hinge.position.set(x, 0.0, 0.01); headPivot.add(hinge);
  }
  const headMotor = part(new THREE.CylinderGeometry(0.016, 0.016, 0.13, 12), M.motor, LAYER.MECH, 'Headrest motor');
  headMotor.rotation.x = -lean; headMotor.position.copy(rel(DIM.headSeamY - 0.09, 0.1)); back.add(headMotor);
  // back frame, webbing, brackets
  for (const x of [0.03, W - 0.03]) {
    const st = part(rail(0.03, 0.58, 0.05), M.wood, LAYER.FRAME, 'Back frame stile');
    st.position.copy(rel(0.6, 0.06)); st.position.x = x - cx; back.add(st);
    const br = part(rbox(0.006, 0.2, 0.05, 0.002), M.steel, LAYER.MECH, 'Back bracket (bolts to mechanism)');
    br.position.copy(rel(0.4, 0.2)); br.position.x = x - cx + (x < cx ? 0.03 : -0.03); back.add(br);
  }
  for (const y of [0.33, 0.6, 0.88]) {
    const r = part(rail(W - 0.06, 0.035, 0.035), M.wood, LAYER.FRAME, 'Back frame rail');
    r.position.copy(rel(y, 0.06)); back.add(r);
  }
  for (let i = 0; i < 4; i++) {
    const s = part(new THREE.BoxGeometry(0.05, 0.52, 0.003), M.webbing, LAYER.SPRING, 'Elastic back webbing');
    s.position.copy(rel(0.6, 0.088)); s.position.x = -0.21 + i * 0.14; back.add(s);
  }
  // first-person camera: rides on the back so the view reclines with you
  const anchor = new THREE.Object3D();
  anchor.position.copy(rel(DIM.seatH + 0.7, DIM.backCushFrontZ - 0.7 * Math.tan(lean) + 0.14));
  back.add(anchor);

  // =========================================================================
  // Footrest: two-stage lazy tongs per side + footrest & filler panels
  // =========================================================================
  const foot = part(softBox(W - 0.03, 0.23, 0.065, { r: 0.03, puffZ: 0.012, bulge: 0.004 }), M.fabric, LAYER.CUSHION, 'Footrest');
  const footFoam = part(new THREE.BoxGeometry(W - 0.08, 0.19, 0.035), M.foam, LAYER.FOAM, 'Footrest foam');
  const footPivot = new THREE.Group();
  footPivot.add(foot, footFoam);
  foot.position.set(0, -0.115, 0.055);
  footFoam.position.copy(foot.position);
  const footPipe = add(footPivot, part(tube([new THREE.Vector3(-W / 2 + 0.03, 0, 0), new THREE.Vector3(W / 2 - 0.03, 0, 0)], 0.003, 4), M.seam, LAYER.DETAIL, 'Piping'), 0, -0.004, 0.088);
  const filler = part(softBox(W - 0.12, 0.21, 0.045, { r: 0.02, puffZ: 0.008 }), M.fabric, LAYER.CUSHION, 'Mid leg-rest (filler) panel');
  car.add(footPivot, filler);
  const TONGS = { z0: 0.88, y0: 0.19, L: 0.22, n: 2 };
  const sides = [0.045, W - 0.045].map((x) => {
    const bars = [];
    for (let i = 0; i < TONGS.n * 2; i++) {
      const b = linkBar(new THREE.Vector3(), new THREE.Vector3(0, 0, 0.1), 0.018, 0.006, M.steel, LAYER.HARD, 'Footrest scissor linkage');
      car.add(b); bars.push(b);
    }
    const rivets = [];
    for (let i = 0; i < TONGS.n * 3 + 2; i++) {
      const r = part(new THREE.CylinderGeometry(0.008, 0.008, 0.016, 10), M.chrome, LAYER.HARD, 'Pivot rivet');
      r.rotation.z = Math.PI / 2; car.add(r); rivets.push(r);
    }
    const bracket = linkBar(new THREE.Vector3(), new THREE.Vector3(0, 0, 0.1), 0.02, 0.006, M.steel, LAYER.HARD, 'Filler panel bracket');
    const footBracket = linkBar(new THREE.Vector3(), new THREE.Vector3(0, 0, 0.1), 0.022, 0.006, M.steel, LAYER.HARD, 'Footrest bracket');
    car.add(bracket, footBracket);
    return { x, bars, rivets, bracket, footBracket };
  });
  const T = Array.from({ length: TONGS.n + 1 }, () => new THREE.Vector3());
  const B = Array.from({ length: TONGS.n + 1 }, () => new THREE.Vector3());
  function tongs(f) {
    const phi = lerp(83, 15, f) * D2R, beta = lerp(0, 17.4, f) * D2R;
    const du = TONGS.L * Math.cos(phi), hv = (TONGS.L * Math.sin(phi)) / 2;
    const cb = Math.cos(beta), sb = Math.sin(beta);
    for (let k = 0; k <= TONGS.n; k++) {
      const u = k * du;
      T[k].set(0, TONGS.y0 + u * sb + hv * cb, TONGS.z0 + u * cb - hv * sb);
      B[k].set(0, TONGS.y0 + u * sb - hv * cb, TONGS.z0 + u * cb + hv * sb);
    }
  }

  // =========================================================================
  // Right arm + switch panel
  // =========================================================================
  const controls = [];
  let armPad = null;
  if (rightArm) {
    const ax = W + AW / 2;
    add(group, part(softBox(AW - 0.01, 0.44, 1.0, { r: 0.045, bulge: 0.006 }), M.fabric, LAYER.SHELL, 'Right arm'), ax, 0.35, 0.5);
    armPad = add(group, part(softBox(AW + 0.004, 0.085, 1.03, { r: 0.04, puff: 0.012, puffZ: 0.018, bulge: 0.008 }), M.fabric, LAYER.SHELL, 'Padded arm top'), ax, DIM.armH - 0.042, 0.512);
    for (const dx of [-AW / 2 + 0.012, AW / 2 - 0.012]) {
      add(group, part(tube([new THREE.Vector3(0, 0, -0.5), new THREE.Vector3(0, 0, 0.5)], 0.003, 4), M.seam, LAYER.DETAIL, 'Piping'), ax + dx, DIM.armH - 0.083, 0.51);
    }
    add(group, part(new THREE.BoxGeometry(AW - 0.06, 0.06, 0.96), M.foam, LAYER.FOAM, 'Arm foam'), ax, DIM.armH - 0.045, 0.51);
    add(group, part(new THREE.BoxGeometry(AW - 0.04, 0.03, 0.94), M.fibre, LAYER.FOAM, 'Fibre wrap'), ax, DIM.armH - 0.1, 0.51);
    for (const z of [0.04, 0.5, 0.96]) wood(group, AW - 0.05, 0.4, 0.035, ax, 0.35, z, 'Arm post');
    wood(group, AW - 0.05, 0.03, 0.96, ax, 0.56, 0.5, 'Arm top rail');
    wood(group, AW - 0.05, 0.04, 0.96, ax, 0.17, 0.5, 'Arm bottom rail');
    for (const x of [W + 0.022, W + AW - 0.022]) add(group, part(new THREE.BoxGeometry(0.012, 0.38, 0.94), M.ply, LAYER.FRAME, 'Plywood arm panel'), x, 0.35, 0.5);
    for (const z of [0.07, 0.95]) add(group, taperedLeg(DIM.legH, { splayX: 0.1, splayZ: z < 0.5 ? -0.1 : 0.06 }), W + AW - 0.06, DIM.legH, z);
    // switch panel inset on the inner face, just above the seat
    const px = W + 0.0005, py = 0.525, pz = 0.84;
    add(group, part(rbox(0.012, 0.054, 0.118, 0.005), M.panel, LAYER.HARD, 'Power switch panel'), px, py, pz);
    const kinds = [['recline-', 'recline', '-', 'Return upright'], ['recline+', 'recline', '+', 'Recline'], ['head-', 'head', '-', 'Lower headrest'], ['head+', 'head', '+', 'Raise headrest']];
    kinds.forEach(([kind, prm, dir, hint], i) => {
      const b = part(new THREE.BoxGeometry(0.008, 0.022, 0.022), [M.panel, glyphMaterial(kind), M.panel, M.panel, M.panel, M.panel], LAYER.HARD, hint);
      add(group, b, px - 0.007, py + 0.005, pz - 0.039 + i * 0.026);
      controls.push({ object: b, id: `${id}:${prm}:${dir}`, hint });
    });
    add(group, part(new THREE.BoxGeometry(0.004, 0.004, 0.013), M.plastic, LAYER.HARD, 'USB-C port'), px - 0.0065, py - 0.018, pz);
    add(group, part(new THREE.BoxGeometry(0.002, 0.003, 0.03), M.led, LAYER.HARD, 'Status light'), px - 0.0065, py - 0.018, pz + 0.035);
  }

  // =========================================================================
  // Pose
  // =========================================================================
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), dir = new THREE.Vector3();
  const UPV = new THREE.Vector3(0, 1, 0);
  const fillerC = new THREE.Vector3();
  function pose() {
    const t = params.recline, e = params.explode;
    const f = phase(t, 0, 0.42);
    const r = phase(t, 0.32, 1);
    const slide = 0.15 * r, rise = 0.012 * r;
    car.position.set(0, rise, slide);
    seatPivot.rotation.x = -5 * D2R * r;
    back.rotation.x = -30 * D2R * r;
    headPivot.rotation.x = 25 * D2R * params.head;
    anchor.rotation.x = 6 * D2R + 28 * D2R * r;   // reclined you still look at the TV (≈2° above level)

    // footrest tongs
    tongs(f);
    footPivot.position.set(cx, T[TONGS.n].y, T[TONGS.n].z + e * 0.18);
    footPivot.rotation.x = -86 * D2R * phase(f, 0.05, 0.92);
    const th = lerp(-72, 51, phase(f, 0.0, 0.85)) * D2R;
    fillerC.set(cx, T[1].y + 0.12 * Math.sin(th), T[1].z + 0.12 * Math.cos(th) + e * 0.09);
    filler.position.copy(fillerC);
    filler.rotation.x = -90 * D2R * phase(f, 0.1, 0.9);
    for (const s of sides) {
      for (let k = 0; k < TONGS.n; k++) {
        aimBar(s.bars[k * 2], v1.copy(T[k]).setX(s.x), v2.copy(B[k + 1]).setX(s.x));
        aimBar(s.bars[k * 2 + 1], v1.copy(B[k]).setX(s.x), v2.copy(T[k + 1]).setX(s.x));
      }
      let ri = 0;
      for (let k = 0; k <= TONGS.n; k++) {
        s.rivets[ri++].position.copy(T[k]).setX(s.x);
        s.rivets[ri++].position.copy(B[k]).setX(s.x);
        if (k < TONGS.n) s.rivets[ri++].position.copy(T[k]).add(B[k + 1]).multiplyScalar(0.5).setX(s.x);
      }
      // filler bracket: mid-stage top pivot → filler underside
      v3.set(0, 0.02, -0.03).applyEuler(filler.rotation).add(fillerC).setX(s.x);
      aimBar(s.bracket, v1.copy(T[1]).setX(s.x), v3);
      // footrest bracket: end pivot → far end of the footrest underside
      v3.set(0, -0.2, 0.03).applyEuler(footPivot.rotation).add(footPivot.position).setX(s.x);
      aimBar(s.footBracket, v1.copy(B[TONGS.n]).setX(s.x), v3);
    }

    // swing links follow the carriage
    for (const s of swing) aimBar(s.bar, s.a, v1.copy(s.c).add(car.position));

    // actuator
    v2.set(cx, 0.2 + rise, 0.62 + slide + 0.07 * f);      // rod end on the carriage lever
    dir.copy(v2).sub(motorPivot).normalize();
    housing.position.copy(motorPivot).addScaledVector(dir, 0.11);
    housing.quaternion.setFromUnitVectors(UPV, dir);
    gearbox.position.copy(motorPivot).addScaledVector(dir, -0.01);
    gearbox.quaternion.copy(housing.quaternion);
    aimRod(actRod, v1.copy(motorPivot).addScaledVector(dir, 0.2), v2);

    // exploded view
    seat.position.y = 0.085 + e * 0.26;
    seatFoam.position.y = seat.position.y;
    seatPipe.position.y = 0.158 + e * 0.26;
    lumbar.position.set(lumbarC.x, lumbarC.y + e * 0.12, lumbarC.z + e * 0.15);
    lumbarFoam.position.copy(lumbar.position);
    headrest.position.set(headC.x, headC.y + e * 0.2, headC.z + e * 0.15);
    headFoam.position.copy(headrest.position);
    if (armPad) armPad.position.y = DIM.armH - 0.042 + e * 0.16;
  }
  pose();

  return {
    name: id,
    group,
    width,
    params,
    set(p, v) {
      if (!(p in params)) return;
      params[p] = clamp01(+v || 0);
      pose();
    },
    controls,
    seats: [{ id, label: rightArm ? 'Recliner (right)' : 'Recliner (left)', anchor }],
  };
}
