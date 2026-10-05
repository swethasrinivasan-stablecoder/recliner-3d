// recliner_quick.js — power wall-hugger recliner (fallback build used until the
// full recliner module lands). Same API as SPEC.md.
import * as THREE from 'three';
import { DIM, LAYER, part, softBox, rbox, rail, tube, sinuousSpring, taperedLeg, linkBar, aimBar, rod, aimRod, clamp01, lerp, phase } from './core.js';
import { M, glyphMaterial } from './materials.js';

const D2R = Math.PI / 180;

export function createRecliner({ id = 'reclinerA', rightArm = false } = {}) {
  const W = DIM.W.recliner, AW = DIM.W.arm;
  const width = rightArm ? W + AW : W;
  const group = new THREE.Group();
  const cx = W / 2;
  const params = { recline: 0, head: 0, explode: 0 };

  // ---------------- static base ----------------
  const base = part(softBox(W - 0.012, 0.155, 0.95, { r: 0.03 }), M.fabric, LAYER.SHELL, 'Upholstered base');
  base.position.set(cx, 0.13 + 0.0775, 0.475);
  group.add(base);
  const baseSeam = part(tube([new THREE.Vector3(0.02, 0.285, 0.951), new THREE.Vector3(W - 0.02, 0.285, 0.951)], 0.003, 4), M.seam, LAYER.DETAIL);
  group.add(baseSeam);
  for (const [x, z, sx, sz] of [[0.07, 0.07, -0.1, -0.1], [W - 0.07, 0.07, 0.1, -0.1], [0.07, 0.78, -0.1, 0.06], [W - 0.07, 0.78, 0.1, 0.06]]) {
    const l = taperedLeg(DIM.legH, { splayX: sx, splayZ: sz });
    l.position.set(x, DIM.legH, z);
    group.add(l);
  }
  // base frame
  const fr = (w, h, d, x, y, z, label = 'Kiln-dried hardwood rail') => { const m = part(rail(w, h, d), M.wood, LAYER.FRAME, label); m.position.set(x, y, z); group.add(m); return m; };
  fr(W - 0.04, 0.09, 0.03, cx, 0.2, 0.03);
  fr(W - 0.04, 0.09, 0.03, cx, 0.2, 0.92);
  fr(0.03, 0.09, 0.9, 0.025, 0.2, 0.475, 'Hardwood side rail');
  fr(0.03, 0.09, 0.9, W - 0.025, 0.2, 0.475, 'Hardwood side rail');
  for (const [x, z] of [[0.05, 0.06], [W - 0.05, 0.06], [0.05, 0.89], [W - 0.05, 0.89]]) fr(0.05, 0.07, 0.05, x, 0.2, z, 'Glued corner block');

  // ---------------- carriage (slides forward; carries seat, back, footrest) ----------------
  const car = new THREE.Group();
  group.add(car);
  const seat = part(softBox(W - 0.014, 0.17, 0.70, { r: 0.055, puff: 0.014, bulge: 0.006 }), M.fabric, LAYER.CUSHION, 'Seat cushion');
  const seatPivot = new THREE.Group();          // seat front tilts up a little
  seatPivot.position.set(cx, 0.28, 0.32);
  car.add(seatPivot);
  seat.position.set(0, 0.085, 0.35);
  seatPivot.add(seat);
  const seatPipe = part(tube([new THREE.Vector3(-W / 2 + 0.03, 0.163, 0.699), new THREE.Vector3(W / 2 - 0.03, 0.163, 0.699)], 0.0035, 4), M.seam, LAYER.DETAIL);
  seatPivot.add(seatPipe);
  const seatFoam = part(new THREE.BoxGeometry(W - 0.06, 0.13, 0.64), M.foam, LAYER.FOAM, 'HR foam 35 kg/m³ with fibre wrap');
  seatFoam.position.set(0, 0.085, 0.35);
  seatPivot.add(seatFoam);
  // seat frame + springs on the carriage
  const cfr = (w, h, d, x, y, z, label) => { const m = part(rail(w, h, d), M.wood, LAYER.FRAME, label); m.position.set(x, y, z); car.add(m); return m; };
  cfr(W - 0.08, 0.04, 0.03, cx, 0.255, 0.34, 'Seat frame rear rail');
  cfr(W - 0.08, 0.04, 0.03, cx, 0.255, 0.95, 'Seat frame front rail');
  for (let i = 0; i < 5; i++) {
    const s = part(sinuousSpring(0.58, 0.018, 8), M.spring, LAYER.SPRING, 'Sinuous S-springs');
    s.position.set(0.1 + i * 0.115, 0.268, 0.355);
    car.add(s);
  }
  // steel mechanism side plates (move with the carriage)
  for (const x of [0.065, W - 0.065]) {
    const p = part(rbox(0.006, 0.08, 0.66, 0.002), M.steel, LAYER.MECH, 'Steel mechanism side plate');
    p.position.set(x, 0.2, 0.56);
    car.add(p);
  }
  const tubeRear = part(new THREE.CylinderGeometry(0.012, 0.012, W - 0.14, 12), M.steel, LAYER.MECH, 'Steel cross tube');
  tubeRear.rotation.z = Math.PI / 2; tubeRear.position.set(cx, 0.19, 0.3); car.add(tubeRear);
  const tubeFront = tubeRear.clone(); tubeFront.position.set(cx, 0.19, 0.84); car.add(tubeFront);
  // linear actuator: housing fixed on the base, rod drives the carriage linkage
  const motorA = new THREE.Vector3(cx, 0.175, 0.12), motorB = new THREE.Vector3();
  const housing = part(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 14), M.motor, LAYER.MECH, 'Power recline motor (29 V DC)');
  group.add(housing);
  const actRod = rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.1, 0), 0.009, M.chrome, LAYER.MECH, 'Linear actuator rod');
  group.add(actRod);
  const cable = part(tube([new THREE.Vector3(cx, 0.16, 0.05), new THREE.Vector3(cx - 0.12, 0.15, 0.03), new THREE.Vector3(0.02, 0.15, 0.04)], 0.004, 16), M.plastic, LAYER.MECH, 'Motor power cable');
  group.add(cable);

  // ---------------- back (pivots on the carriage) ----------------
  const PIV = new THREE.Vector3(cx, 0.42, 0.26);
  const back = new THREE.Group();
  back.position.copy(PIV);
  car.add(back);
  const rel = (y, z) => new THREE.Vector3(0, y - PIV.y, z - PIV.z);
  const shell = part(softBox(W - 0.004, 0.62, 0.15, { r: 0.045, bulge: 0.004 }), M.fabric, LAYER.SHELL, 'Upholstered back panel');
  shell.position.copy(rel(0.59, 0.075));
  back.add(shell);
  const lean = DIM.backLean;
  const lumbar = part(softBox(W - 0.03, 0.31, DIM.backCushT, { r: 0.06, puffZ: 0.022, bulge: 0.008 }), M.fabric, LAYER.CUSHION, 'Lumbar back cushion');
  const lumbarC = rel(0.605, DIM.backCushFrontZ - 0.155 * Math.tan(lean) - DIM.backCushT / 2);
  lumbar.position.copy(lumbarC); lumbar.rotation.x = -lean;
  back.add(lumbar);
  const lumbarFoam = part(new THREE.BoxGeometry(W - 0.08, 0.26, 0.12), M.foam, LAYER.FOAM, 'Back foam with fibre wrap');
  lumbarFoam.position.copy(lumbarC); lumbarFoam.rotation.x = -lean; back.add(lumbarFoam);
  // headrest hinged at the seam (power headrest)
  const seamZ = DIM.backCushFrontZ - (DIM.headSeamY - DIM.seatH) * Math.tan(lean);
  const headPivot = new THREE.Group();
  headPivot.position.copy(rel(DIM.headSeamY, seamZ - DIM.backCushT));
  back.add(headPivot);
  const headH = DIM.backH - DIM.headSeamY;
  const headC = new THREE.Vector3(0, headH / 2 * Math.cos(lean), DIM.backCushT / 2 - headH / 2 * Math.sin(lean));
  const headrest = part(softBox(W - 0.03, headH + 0.01, DIM.backCushT, { r: 0.07, puffZ: 0.02, puff: 0.01, bulge: 0.008 }), M.fabric, LAYER.CUSHION, 'Power headrest');
  headrest.position.copy(headC); headrest.rotation.x = -lean;
  headPivot.add(headrest);
  const headFoam = part(new THREE.BoxGeometry(W - 0.08, headH - 0.04, 0.12), M.foam, LAYER.FOAM, 'Headrest foam');
  headFoam.position.copy(headC); headFoam.rotation.x = -lean; headPivot.add(headFoam);
  const headMotor = part(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 12), M.motor, LAYER.MECH, 'Headrest motor');
  headMotor.rotation.z = Math.PI / 2; headMotor.position.copy(rel(DIM.headSeamY - 0.03, 0.09)); back.add(headMotor);
  // back frame + webbing
  for (const x of [0.03, W - 0.03]) {
    const st = part(rail(0.03, 0.56, 0.05), M.wood, LAYER.FRAME, 'Back frame stile');
    st.position.copy(rel(0.6, 0.06)); st.position.x = x - cx; back.add(st);
  }
  for (const y of [0.34, 0.87]) {
    const r = part(rail(W - 0.06, 0.04, 0.04), M.wood, LAYER.FRAME, 'Back frame rail');
    r.position.copy(rel(y, 0.06)); back.add(r);
  }
  for (let i = 0; i < 4; i++) {
    const s = part(new THREE.BoxGeometry(0.05, 0.5, 0.003), M.webbing, LAYER.SPRING, 'Elastic back webbing');
    s.position.copy(rel(0.61, 0.088)); s.position.x = -0.21 + i * 0.14; back.add(s);
  }
  // seat camera: rides on the back so the view reclines with you
  const anchor = new THREE.Object3D();
  anchor.position.copy(rel(DIM.seatH + 0.70, DIM.backCushFrontZ - 0.70 * Math.tan(lean) + 0.13));
  back.add(anchor);

  // ---------------- footrest (scissor linkage) ----------------
  const foot = part(softBox(W - 0.04, 0.23, 0.065, { r: 0.03, puffZ: 0.01 }), M.fabric, LAYER.CUSHION, 'Footrest');
  const filler = part(softBox(W - 0.06, 0.2, 0.05, { r: 0.022, puffZ: 0.006 }), M.fabric, LAYER.CUSHION, 'Leg-rest filler panel');
  const footFoam = part(new THREE.BoxGeometry(W - 0.1, 0.18, 0.035), M.foam, LAYER.FOAM, 'Footrest foam');
  foot.add(footFoam);
  car.add(foot, filler);
  const links = [];
  for (const x of [0.075, W - 0.075]) {
    const a = linkBar(new THREE.Vector3(), new THREE.Vector3(0, 0, 0.1), 0.02, 0.006, M.steel, LAYER.HARD, 'Scissor linkage');
    const b = linkBar(new THREE.Vector3(), new THREE.Vector3(0, 0, 0.1), 0.02, 0.006, M.steel, LAYER.HARD, 'Scissor linkage');
    const c = linkBar(new THREE.Vector3(), new THREE.Vector3(0, 0, 0.1), 0.018, 0.006, M.steel, LAYER.HARD, 'Footrest bracket');
    car.add(a, b, c);
    links.push({ x, a, b, c });
  }
  // closed / open poses (carriage space): [y, z, rotX]
  const FOOT_C = [0.18, 0.985, 0], FOOT_O = [0.395, 1.38, -Math.PI / 2 + 0.1];
  const FILL_C = [0.19, 0.915, 0], FILL_O = [0.385, 1.135, -Math.PI / 2 + 0.03];

  // ---------------- right arm + switch panel ----------------
  const controls = [];
  if (rightArm) {
    const ax = W + AW / 2;
    const arm = part(softBox(AW - 0.004, DIM.armH - 0.13, 1.02, { r: 0.07, puff: 0.012, bulge: 0.008, puffZ: 0.012 }), M.fabric, LAYER.SHELL, 'Right arm');
    arm.position.set(ax, 0.13 + (DIM.armH - 0.13) / 2, 0.51);
    group.add(arm);
    const pipe = part(tube([new THREE.Vector3(W + 0.035, DIM.armH - 0.012, 0.02), new THREE.Vector3(W + 0.035, DIM.armH - 0.012, 0.99)], 0.0035, 4), M.seam, LAYER.DETAIL);
    const pipe2 = pipe.clone(); pipe2.position.x = AW - 0.07;
    group.add(pipe, pipe2);
    const armFoam = part(new THREE.BoxGeometry(AW - 0.06, 0.12, 0.96), M.foam, LAYER.FOAM, 'Arm foam');
    armFoam.position.set(ax, DIM.armH - 0.08, 0.51); group.add(armFoam);
    for (const z of [0.04, 0.5, 0.98]) { const p = part(rail(AW - 0.05, 0.42, 0.035), M.wood, LAYER.FRAME, 'Arm post'); p.position.set(ax, 0.36, z); group.add(p); }
    const top = part(rail(AW - 0.05, 0.03, 0.98), M.wood, LAYER.FRAME, 'Arm top rail'); top.position.set(ax, 0.56, 0.51); group.add(top);
    for (const x of [W + 0.03, W + AW - 0.03]) { const pl = part(new THREE.BoxGeometry(0.012, 0.4, 0.96), M.ply, LAYER.FRAME, 'Plywood arm panel'); pl.position.set(x, 0.36, 0.51); group.add(pl); }
    for (const z of [0.07, 0.95]) { const l = taperedLeg(DIM.legH, { splayX: 0.1, splayZ: z < 0.5 ? -0.1 : 0.06 }); l.position.set(W + AW - 0.06, DIM.legH, z); group.add(l); }

    // switch panel on the arm's inner face
    const px = W - 0.004, py = 0.525, pz = 0.84;
    const plate = part(rbox(0.01, 0.052, 0.112, 0.004), M.panel, LAYER.HARD, 'Power switch panel');
    plate.position.set(px, py, pz);
    group.add(plate);
    const kinds = [['recline-', 'recline', '-', 'Return upright'], ['recline+', 'recline', '+', 'Recline'], ['head-', 'head', '-', 'Lower headrest'], ['head+', 'head', '+', 'Raise headrest']];
    kinds.forEach(([kind, prm, dir, hint], i) => {
      const b = part(new THREE.BoxGeometry(0.008, 0.022, 0.022), [M.panel, glyphMaterial(kind), M.panel, M.panel, M.panel, M.panel], LAYER.HARD, hint);
      b.position.set(px - 0.006, py + 0.004, pz - 0.04 + i * 0.026);
      group.add(b);
      controls.push({ object: b, id: `${id}:${prm}:${dir}`, hint });
    });
    const usb = part(new THREE.BoxGeometry(0.004, 0.004, 0.012), M.plastic, LAYER.HARD, 'USB-C port');
    usb.position.set(px - 0.0055, py - 0.017, pz);
    group.add(usb);
  }

  // ---------------- pose ----------------
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
  function pose() {
    const t = params.recline, e = params.explode;
    const f = phase(t, 0, 0.42);          // footrest out first
    const r = phase(t, 0.32, 1);          // then the carriage slides & the back reclines
    const slide = 0.15 * r;
    car.position.z = slide;
    seatPivot.rotation.x = -5 * D2R * r;
    back.rotation.x = -30 * D2R * r;
    headPivot.rotation.x = 25 * D2R * params.head;
    anchor.rotation.x = 6 * D2R + 0.42 * 30 * D2R * r;

    const arc = Math.sin(Math.PI * f);
    foot.position.set(cx, lerp(FOOT_C[0], FOOT_O[0], f) + arc * 0.05, lerp(FOOT_C[1], FOOT_O[1], f) + arc * 0.04 + e * 0.2);
    foot.rotation.x = lerp(FOOT_C[2], FOOT_O[2], f);
    filler.position.set(cx, lerp(FILL_C[0], FILL_O[0], f) + arc * 0.03, lerp(FILL_C[1], FILL_O[1], f) + arc * 0.02 + e * 0.1);
    filler.rotation.x = lerp(FILL_C[2], FILL_O[2], f);
    filler.visible = f > 0.02 || e > 0 ? filler.visible : filler.visible;

    // scissor links: from the carriage's front cross tube to the footrest underside
    for (const L of links) {
      v1.set(L.x, 0.2, 0.84);                                   // fixed pivot on the carriage
      v2.set(L.x, 0.2 + 0.02, 0.9);
      // footrest underside points (carriage space)
      v3.set(0, -0.04, -0.06).applyEuler(foot.rotation).add(foot.position); v3.x = L.x;
      v4.set(0, 0.06, -0.05).applyEuler(foot.rotation).add(foot.position); v4.x = L.x;
      aimBar(L.a, v1, v3);
      aimBar(L.b, v2, v4);
      v1.set(0, 0, -0.03).applyEuler(filler.rotation).add(filler.position); v1.x = L.x;
      aimBar(L.c, v2, v1);
    }

    // actuator: rod end follows the front cross tube
    motorB.set(cx, 0.19, 0.6 + slide + 0.12 * f);
    const dir = v1.copy(motorB).sub(motorA);
    housing.position.copy(motorA).addScaledVector(dir.clone().normalize(), 0.1);
    housing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    aimRod(actRod, v2.copy(motorA).addScaledVector(dir.clone().normalize(), 0.18), motorB);

    // exploded view
    seat.position.y = 0.085 + e * 0.26;
    seatFoam.position.y = 0.085 + e * 0.26;
    lumbar.position.set(lumbarC.x, lumbarC.y + e * 0.12, lumbarC.z + e * 0.14);
    lumbarFoam.position.copy(lumbar.position);
    headrest.position.set(headC.x, headC.y + e * 0.2, headC.z + e * 0.14);
    headFoam.position.copy(headrest.position);
  }
  pose();

  return {
    name: id,
    group,
    width,
    params,
    set(p, v) { if (!(p in params)) return; params[p] = typeof v === 'number' ? clamp01(v) : v; pose(); },
    controls,
    seats: [{ id, label: rightArm ? 'Recliner (right)' : 'Recliner (left)', anchor }],
  };
}
