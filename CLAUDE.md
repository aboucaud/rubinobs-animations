# CLAUDE.md — project memory

Interactive Three.js + TypeScript animations of the Rubin Observatory (Vite static site, deployed to
GitHub Pages from `main`). See README.md for pages, tools and commands.

## Before committing

```bash
npm run build      # tsc type-check + vite build
npm run validate   # ray tracer vs batoid; must print "OK" (CI runs it)
```

To check a page visually: `npm run preview`, then `node tools/shot.cjs <page>/ <name> "<js>"` → `shots/<name>.png`
(software WebGL: slow, but enough to compare before/after). Add `"" 4000 phone` or `"" 4000 phone-land` for a
phone in portrait (390×844) or landscape (844×390). Where playwright's own Chromium cannot be downloaded,
set `CHROME=/usr/bin/google-chrome` (and `NODE_PATH` to a global playwright install).

## Phone layout (Nov 2026): every UI change must keep it

Every page must stay usable on a phone in portrait and landscape: no panel may cover another one
(header, settings menu, info panel, inset, steps, bottom bar), and the animation keeps the middle of the screen.
- `initPhoneLayout()` (`common.ts`, called by `createViewer`; a 2D page calls it itself) is the single
  source of truth: it sets `body.phone` for narrow *or* short screens (`max-width: 720px, max-height: 500px`).
  Phone CSS keys on `body.phone`, never on its own `@media` width query; JS uses `isPhone()`.
- Settings menus come from `createGui(title)` (closed by default on phones), not `new GUI()`.
  lil-gui 0.21 class names are `lil-root`, `lil-closed`, `lil-title`.
- `#info` shows only its key line on a phone: the `.band` line and any child with class `key`.
  Tapping it shows the rest. Put new essential state in a `.key` line, details in plain lines.
- Panels that sit above the bottom bar use `var(--bar-h)` (kept up to date by `initPhoneLayout`).
  In landscape the bar is one row that scrolls sideways.
- Panels have `z-index: 2`, labels `1`: a label never draws over a panel.
- Before committing a UI change, take `phone` and `phone-land` shots of the pages it touches.

## Code layout

- `src/optics/` — sequential ray tracer (validated against batoid, do not change without `npm run validate`).
- `src/scene/` — procedural models (telescope, LSSTCam, filter exchanger, focal plane, observatory),
  materials, textures, rays, band colours (`bands.ts`: the single source for band colours and texts).
- `src/apps/` — one script per page. `common.ts` holds what every page shares: `createViewer`
  (renderer, scene, camera, controls, post-processing, resize), `createLabels`, `CameraTween`,
  `faceCutPlane`, `glowTexture`, `createGui`, `initPhoneLayout` / `isPhone`. A new page should be built on it, not copy boilerplate.
- `src/scene/human.ts` — `buildHuman(pos, lookAt, height)`: one-mesh standing figure (1.75 m reference)
  used for scale on the telescope, camera and observatory pages. Place figures where they do not hide
  the subject in the preset views, and outside any volume swept by a moving part.
- `src/scene/util.ts` — geometry helpers in the OCS-aligned frame (`ocs`, `lathe`, `lensSolid`, `tube`, `box`…).

## Performance design (Nov 2026): what is automatic, what to watch

The optimisations live in the building blocks, so new parts, pages and visual changes benefit from
them without redoing anything. Two rules must be respected when editing.

**Automatic**
- Static meshes are merged into one mesh per material by `mergeStatic` (`src/scene/optimize.ts`),
  called at the end of each model builder (telescope tube, each LSSTCam part, carousel, autochanger,
  filters, dome, drum, buildings). New static parts added in those builders are merged for free.
- Colours, materials, textures, shapes and lighting can change freely; a new material simply makes
  one more merged mesh. Transparent and instanced meshes are never merged.
- All rays go through `RayBuilder` / `RayBundle` (`src/scene/rays.ts`): compact indexed typed arrays,
  GPU buffers reused between updates. Use `Rubin.forBand(band)` rather than `new Rubin(band)`.

**Rule 1: a new moving part must be excluded from merging.**
Anything that moves, changes material, or is shown/hidden on its own after the build must be passed
in the `keep` list of the `mergeStatic(...)` call of its assembly (or live in a group that is in that
list, like `parts.blades` or the dome doors). Otherwise it is baked into the merged mesh and silently
stops moving. Referencing the object afterwards (position, material, visible) has no visible effect.
Safety net: under `npm run dev`, a baked mesh is locked and any later change to its transform,
`visible` or `material` throws `mergeStatic: "<name>" was baked into a merged mesh…`. So test
animations in dev mode and watch the console; the production build has no such check.

**Rule 2: a new input of a ray trace must be in the cache key.**
`src/apps/telescope.ts` caches baked traces in a `TraceCache` (LRU, 2 MB budget) keyed by every
setting that changes the trace (band, field angle, field direction, pattern, density). A new setting
that changes the trace (wavelength, fan angle, start height…) must be added to that key, or stale
bundles will be shown. The camera page caches one bundle per band (`traced` map).

**Pitfall: `cam.update()` resets visibilities.** `buildLSSTCam().update()` shows the camera body
whenever the camera is not exploded. A page that hides parts (the filters page hides the body)
must re-apply its visibility after every `cam.update()`: on the filters page always call
`refreshModel()`, never `cam.update()` alone. (Regression fixed in Nov 2026: the body covered
the filter during an exchange.)

**Pitfall: labels only touch the DOM when their visibility changes** (`createLabels` in
`common.ts`). Any per-element cached state must start consistent with the DOM (labels start hidden).

**Measured effect** (software WebGL, so only draw calls and memory are meaningful):
draw calls per frame telescope 1978 → 298, camera 1200 → 260, filters 1051 → 187,
observatory 2564 → 658; peak JS heap during a dense ray-slider sweep 55.7 → ~24 MB.

**Tried and rejected:** `renderer.compileAsync` before the first frame compiled ~25 % more shader
programs than it saved (state mismatch with the composer's render target), so pages render the first
frame synchronously.

## Sources

Every repository, document, data set and visual reference the animations are built from is listed in
`REFERENCES.md` (moved out of the README in Nov 2026; the README only links to it). Add any new source
there in the same commit that uses it.

## Tools

- `tools/export_prescription.py` → `src/data/prescription.json` (needs batoid).
- `tools/filter_colours.py` → `src/data/filter_colours.json` (downloads lsst/throughputs on first use
  into `tools/throughputs/`, git-ignored).
