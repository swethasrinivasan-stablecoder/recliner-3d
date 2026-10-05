# Recliner Sectional 3D

Interactive three.js model of an L-shaped sectional: chaise, a single seat with a pull-out bed, a cup-holder console and two power wall-hugger recliners, placed in a real vardagsrum floor plan (4.59 × 3.62 m) with a 75" TV.

- **Move**: recline / headrests (tap or hold, also via the 3D switch panels), pull-out bed, chaise storage, console lid, cups
- **View**: orbit, stand at eye height (WASD), or sit in any seat; floor-plan view with measurements; day/evening light
- **Inside**: x-ray, frame-only and exploded views with part labels
- **Colour**: Scandinavian colourways, fabrics, legs, walls, floor
- **Sizes**: "Room-fit" 350 cm (default) or "As pictured" 372 cm

## Run locally
```bash
python3 -m http.server 8770
```
Then open http://localhost:8770/index.html (native ES modules) or `dist/preview.html` (single-file bundle).

## Build
- `tools/build.sh` writes `index.html` from `src/ui.html`
- `tools/dist.sh` bundles everything into `dist/sofa.html` (needs Node + npx for esbuild)
- `tools/shot.sh` takes headless Chrome screenshots, e.g. `tools/shot.sh "dist/preview.html?shot=plan&dims=1&ui=0" plan.png`

## Layout
- `src/app.js` – scene, room plan, cameras, interaction, UI
- `src/core.js`, `src/materials.js` – shared dimensions, geometry helpers, materials and palettes
- `src/chaise.js`, `src/bedseat.js`, `src/console.js`, `src/recliner.js`, `src/room.js` – modules
- `dev.html` – single-module test harness (`dev.html?m=recliner&p_recline=1&mode=xray`)
- `SPEC.md` – module contract
