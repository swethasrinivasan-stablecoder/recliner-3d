# Sofa 3D — build spec

An interactive three.js (r169, ES modules) model of the owner's L-shaped sectional, based on
`reference.jpg` (read it!). The app lets them recline, pull out the bed, open storage, sit in
any seat (first-person), see the internal structure (x-ray / frame-only / exploded), and try
Scandinavian colourways.

## The sofa, left → right as seen from the front

| # | module (`name`) | width (x) | depth (z) | what it is |
|---|---|---|---|---|
| 1 | `chaise` | 1.02 | 1.72 | Divan / chaise longue on the LEFT end, extends forward. Low outer arm on its left side. |
| 2 | `bedseat` | 0.88 | 1.02 | Single seat next to the chaise. Has a **pull-out bed**: a padded platform slides forward to the chaise's front line (z 1.72) and rises to seat height, making one flat bed with the chaise. |
| 3 | `console` | 0.28 | 1.02 | Separator console: two cup holders, lift-lid storage, and the **power-recline switch panel for recliner A** on its right side face. |
| 4 | `reclinerA` | 0.66 | 1.02 | Power recliner (no arm). |
| 5 | `reclinerB` | 0.66 + 0.22 arm | 1.02 | Power recliner + the sofa's right arm. Its switch panel is on the arm's inner face. |

Overall: 3.72 m long, 1.72 m deep at the chaise, 1.02 m elsewhere. The app places modules
side by side at x offsets 0, 1.02, 1.90, 2.18, 2.84. Adjacent modules touch; build each
so its side faces look right when exposed (exploded view separates them).

## Look (from the photo)
- Soft oat chenille, plush pillow-like cushions with rounded edges, very clean modern lines.
- Back cushions are tall pillows split by a horizontal seam into a lumbar section and a
  headrest roll (seam at y≈0.76). Upright backs all line up at y=0.98.
- Thick seat cushions (18 cm) with rounded front edges sitting on a slim upholstered base box.
- Slim, tapered, slightly splayed metal legs (gunmetal) 13 cm tall; the sofa floats.
- Right arm: slim (22 cm), soft rounded top that swells slightly toward the front.
- Chaise: low outer arm along its left side that stops partway (~1.15 m from the back) with
  a rounded padded end; the chaise cushion is long and continues past the arm's end.
- Seams: thin grooves/piping in a slightly darker tone (`M.seam`).

## Coordinate frame (every module)
- Units metres. y up. Module-local origin: **x=0 at the module's LEFT edge, y=0 floor,
  z=0 the BACK face of the sofa; +z points to the FRONT** (toward the viewer).
- Module occupies x ∈ [0, width], z ∈ [0, depth].
- Use `DIM` from `src/core.js` for all shared heights (seat 0.45, base top 0.28, arm 0.62,
  back 0.98, leg 0.13, base front 1.00, seat front 1.02, back shell z 0→0.15, back cushion
  front at seat level z≈0.32, back lean 9°, headrest seam y 0.76).

## Module API (contract — the app depends on it exactly)
Each module file exports one factory returning a plain object:

```js
export function createRecliner(opts) -> {
  name: 'reclinerA',                 // from opts.id for recliners; fixed name for others
  group: THREE.Group,                // module-local frame above
  width: 0.88,                       // x extent
  params: { recline: 0, head: 0, explode: 0 },   // current values; all in [0,1]
  set(param, value),                 // apply the pose for value∈[0,1] immediately (no tweening — the app animates)
  controls: [ { object, id, hint } ],// clickable 3D objects (a Mesh or Group)
  seats: [ { id, label, anchor } ],  // first-person seat cameras
}
```
- `set()` must be **pure pose**: same value → same pose, any order of calls, any number of
  times. It must compose all params (e.g. explode on top of recline).
- `explode` (0→1) separates the module's own parts so the build-up is readable: cushions lift
  20–30 cm, back cushions move up/back, arm pads lift, lids open etc. (the app separately
  spreads the modules apart along x). Frame/mechanism parts stay put.
- **controls**: `id` format `"<moduleName>:<param>:<dir>"` with dir `+`, `-` or `toggle`,
  e.g. `reclinerA:recline:+`, `reclinerA:head:-`, `bedseat:bed:toggle`, `console:lid:toggle`.
  `hint` is short UI text ("Recline", "Return upright", "Pull out bed"). The app raycasts
  against `object` and its descendants; make the hit target reasonably sized (≥ 2 cm).
  Mark control meshes `LAYER.HARD` so they show in every view mode.
- **seats**: `anchor` is an `Object3D` parented INSIDE the moving part (e.g. the recliner's
  back) so it follows the pose. The app places the camera at the anchor's world position and
  looks along the anchor's local **+Z**, with local +Y as up. Seated eye ≈ 0.70 m above the
  seat surface and ~0.12 m in front of the back cushion face. Upright gaze ≈ 6° below
  horizontal; at full recline the gaze should end up ≈ 10–15° *above* horizontal (counter-
  rotate the anchor relative to the back, like a person tilting their head forward).

## Layers & view modes (`LAYER`, `applyViewMode` in core.js)
Tag every mesh via `part(geo, material, LAYER.X, 'Human label')`. Labels are shown on hover in
x-ray/frame mode, so name parts like a furniture maker would ("Kiln-dried hardwood frame",
"Sinuous S-springs", "Power recline actuator", "HR foam 35 kg/m³", "Scissor linkage").
- `SHELL`, `CUSHION`: upholstery → visible finished, ghosted in x-ray, hidden in frame mode.
- `DETAIL`: seams/piping → finished only.
- `FOAM`: foam/fibre blocks inside cushions and arms → x-ray only (use `M.foam`, `M.fibre`).
- `FRAME`, `SPRING`, `MECH`: internal structure → x-ray and frame modes.
- `HARD`: legs, visible linkage under an open footrest, cup holders, buttons, handles → always.
Internals should be **real-looking and coherent**: a timber frame that actually supports the
upholstery (rails, posts, corner blocks, plywood back panels), sinuous springs spanning the
seat frame front-to-back, elastic webbing on the backs, foam blocks filling the cushions,
and steel mechanisms that move correctly with the params.

## Shared materials (`M` in src/materials.js — never create your own upholstery material)
`fabric` (all upholstery), `seam`, `underside`, `leg`, `wood`, `ply`, `steel`, `chrome`,
`spring`, `webbing`, `foam`, `fibre`, `motor`, `plastic`, `stainless`, `panel`, `led`,
`felt`, `rubber`, `accent`, `throw`, `ceramic`, `coffee`, `ghost`.
`glyphMaterial(kind)` gives a button-face material with an icon for kind ∈
`'recline+' 'recline-' 'head+' 'head-' 'usb' 'bed'`.
You may create *local* materials only for things not covered (e.g. a room's floor/rug/wall).

## Helpers (src/core.js)
`DIM`, `LAYER`, `part()`, `at()`, `softBox(w,h,d,{r,puff,puffBottom,puffZ,bulge,seg,edgeSeg})`
(centred upholstered rounded box with pillow crowning — use for ALL upholstery), `rbox()`
(hard rounded box), `rail()` (timber), `tube()`, `rod()/aimRod()`, `linkBar()/aimBar()`
(flat steel link between two points in a constant-x plane, for animated linkages),
`sinuousSpring(len)` (runs along +z), `taperedLeg(h,{splayX,splayZ})` (origin at the leg TOP),
`clamp01`, `lerp`, `smooth`, `phase(t,a,b)` (staged motion).
Do **not** edit core.js or materials.js; put module-specific helpers in your own file. If you
believe a shared helper is buggy, work around it locally and say so in your final report.

## Performance budget
≤ ~60k triangles per seat module (console/room less). Reuse geometries where possible; no
per-frame allocations inside `set()` (preallocate Vector3s).

## Verification (required)
Use the dev harness and headless screenshots — look at every screenshot you take:
```
tools/shot.sh --dom "dev.html?m=recliner"                       # errors, bounds, labels, controls, seats
tools/shot.sh "dev.html?m=recliner&cam=iso" shots/recliner-iso.png
tools/shot.sh "dev.html?m=recliner&p_recline=1&cam=side" shots/recliner-side-open.png
tools/shot.sh "dev.html?m=recliner&mode=xray&p_recline=0.5" shots/recliner-xray.png
tools/shot.sh "dev.html?m=recliner&mode=frame&cam=side" shots/recliner-frame.png
tools/shot.sh "dev.html?m=recliner&p_explode=1&cam=iso" shots/recliner-explode.png
tools/shot.sh "dev.html?m=recliner&cam=sit&p_recline=1" shots/recliner-sit.png
tools/shot.sh "dev.html?m=recliner&hl=1" shots/recliner-controls.png
```
`cam` ∈ iso, front, side, left, back, top, under, low, close, sit (+ `zoom=2`). Name your
screenshots `shots/<module>-*.png`. The harness `m` keys: recliner (`arm=0` for no arm),
console, chaise, bedseat, room. Check intermediate values (0.25, 0.5, 0.75) for clipping —
moving parts must never pass through each other or the floor, and must stay inside the
sofa's footprint except where they're meant to extend (footrest, bed).
