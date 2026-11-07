# rubinobs-animations

Interactive, physically accurate outreach animations of the Vera C. Rubin Observatory, the Simonyi Survey Telescope and the LSST Camera (LSSTCam).

**Live site:** https://aboucaud.github.io/rubinobs-animations/ (rebuilt automatically on every push to `main`)

## Stack

- [Three.js](https://threejs.org) (WebGL 2) + TypeScript, built with [Vite](https://vitejs.dev) into a static site
- lil-gui controls, bloom post-processing for the light rays

## Physics

Light paths come from a sequential ray tracer (`src/optics/`) driven by the Rubin optical prescription from [batoid](https://github.com/jmeyers314/batoid) (`LSST_{u,g,r,i,z,y}.yaml`). It handles conic and aspheric mirrors, refraction in fused silica (Sellmeier index), and the batoid LTS-213 baffle and spider obscurations. `tools/validate.ts` checks it against batoid reference traces: every test ray lands at the same position (0.000 nm error), the same rays are vignetted, and centroids agree in all six bands.

The focal-plane layout (rafts, e2v/ITL CCDs, corner guiders and wavefront sensors) follows `obs_lsst`.

## Development

```bash
npm install
npm run dev        # local dev server
npm run build      # type-check + static site in dist/
npm run preview    # serve dist/ on http://localhost:4173
npm run validate   # compare the ray tracer with batoid (fails on any disagreement; run in CI)
```

Tools (`tools/`):

| Script | What it does |
|---|---|
| `validate.ts` | ray tracer vs batoid: individual rays (positions, vignetting) and star centroids in all bands |
| `export_prescription.py` | regenerates `src/data/prescription.json` from batoid (`pip install batoid`) |
| `filter_colours.py` | regenerates `src/data/filter_colours.json` from the lsst/throughputs filter curves (downloaded on first use into `tools/throughputs/`, not versioned) |
| `shot.cjs` | screenshot of a page with software WebGL, against `npm run preview`: `node tools/shot.cjs telescope/ name "__rubin.goView('Focal plane')"` → `shots/name.png` |

## Pages

| Page | Source | What it shows |
|---|---|---|
| `index.html` | landing page | links to every animation |
| `telescope/` | `src/apps/telescope.ts` | the Simonyi telescope with a live ray trace from the sky to the focal plane |
| `camera/` | `src/apps/camera.ts` | LSSTCam: exploded view, light through L1–L3, filter exchange, shutter, exposure and readout |
| `filters/` | `src/apps/filters.ts` | the filter exchange system (carousel + autochanger), step by step with real timings |
| `observatory/` | `src/apps/observatory.ts` | the summit, the rotating dome and the survey, from day to night |

Project notes for contributors and Claude Code (conventions, the two rules to keep the optimisations working): `CLAUDE.md`.

Shared modules: `src/optics/` (ray tracer), `src/scene/` (telescope, camera, filter exchanger, focal plane, observatory, rays, materials, band colours) and `src/apps/common.ts` (renderer, labels, camera tweens, cutaway plane).

## Performance

- **Models.** The geometry is procedural and made of thousands of small parts. Once built, the static meshes of every rigid assembly are merged into one mesh per material (`src/scene/optimize.ts`); moving parts (filters, carousel clamps, autochanger, shutter blades, dome doors and vents) stay separate. This cuts draw calls per frame by 5–7× (telescope page: ≈ 2,000 → ≈ 300). Terrain road lookups use a spatial grid (exact same heights, ≈ 2.4× faster).
- **Ray traces.** Rays are streamed into compact typed arrays as they are traced (shared vertices + index pairs, 24 bytes per vertex), GPU buffers are re-used between updates, and slider changes are traced at most once per frame. Baked traces are kept in an LRU cache with a 2 MB budget, so returning to a configuration already seen is free while memory stays bounded. One `Rubin` instance is kept per band.

## Status

- Exact: optical surfaces (M1–M3, L1–L3, filters per band), baffles and spider, focal-plane layout, camera body radius.
- Scale: standing adults (1.65–1.78 m, `src/scene/human.ts`) on the azimuth platform (telescope page), beside the camera cart (camera page), at the drum entrance and on the telescope floor (observatory page).
- Schematic: the mount (TMA), mirror cell, centre section and camera internals (carousel sockets, autochanger rails, shutter frame, cryostat interior, utility trunk), dome and summit buildings. These will be replaced as better geometry (NOIRLab CAD, LSSTCam drawings) becomes available.

## Sources

Everything the animations are built from. Keep this list up to date when a new source is used (code, data, document or visual reference).

### Public repositories and data (used directly by the code)

| Source | Used for |
|---|---|
| [jmeyers314/batoid](https://github.com/jmeyers314/batoid) — `batoid/data/LSST/LSST_{u,g,r,i,z,y}.yaml`, `LSST_r_baffles_LTS-213.yaml` | optical prescription of every surface (`src/data/prescription.json`, exported by `tools/export_prescription.py`), baffles, spider and camera-body obscurations, reference traces for `npm run validate` |
| [lsst/obs_lsst](https://github.com/lsst/obs_lsst) — `policy/cameraHeader.yaml`, `policy/rafts.yaml`, `policy/lsstCam/R*.yaml` | focal-plane layout: raft and CCD positions, e2v / ITL sensor sizes, corner guiders and wavefront sensors |
| [lsst/throughputs](https://github.com/lsst/throughputs) — `baseline/filter_*.dat` | filter transmission curves → filter colours in reflection and transmission (`tools/filter_colours.py`) |
| [lsst-ts/ts_xml](https://github.com/lsst-ts/ts_xml) — `python/lsst/ts/xml/tables/m1m3/fa_table.py` | M1M3 actuator count and extent; height of the elevation axis above the M1 vertex (inferred) |
| Wyman, Sloan & Shirley 2013, *Simple Analytic Approximations to the CIE XYZ Color Matching Functions*, JCGT 2(2) | CIE 1931 colour-matching functions used for the filter colours |

### Rubin technical documents

- SITCOMTN-003, coordinate systems — https://sitcomtn-003.lsst.io/ (OCS frame used everywhere in the code)
- SITCOMTN-007, as-built optical model — https://sitcomtn-007.lsst.io/
- CTN-001, LSSTCam focal-plane layouts — https://ctn-001.lsst.io/
- CTN-005, shutter timing and motion profiles — https://ctn-005.lsst.io/
- Observatory operations, MTDome — https://obs-ops.lsst.io/Simonyi/Components/MTCS/MTDome.html (dome slit, light/wind screen, vents, flat-field screen)
- LSSTCam Filter Exchange System, arXiv:2606.31995 — https://arxiv.org/abs/2606.31995 (carousel, autochanger, sequence timings)
- M2 baffle and scattered light, arXiv:2606.31793 — https://arxiv.org/abs/2606.31793
- On-sky performance of the LSSTCam CCD array, arXiv:2606.31806 — https://arxiv.org/abs/2606.31806
- Rubin active optics system, arXiv:2406.04656 — https://arxiv.org/abs/2406.04656 (hexapods, rotator, degrees of freedom)
- Olivier et al., *LSST Camera Optics Design* (LLNL-PROC-558973) — https://www.osti.gov/servlets/purl/1046117 (lenses, filters, L3 window)
- *Mechanical design of the LSST camera* (SLAC-PUB-13243) — https://inspirehep.net/files/ca10f51c6d07264d992ef3d55ee314cc
- Martin et al., M1M3 fabrication (SPIE 7018) — https://wp.optics.arizona.edu/loft/wp-content/uploads/sites/6/2025/03/70180G_1.pdf
- Neill et al. 2014, *Baseline design of the LSST Telescope Mount Assembly* (SPIE 9145) — https://www.lsst.org/node/603 ; Callahan et al. 2016, *LSST mount final design* (SPIE 9906) — https://www.lsst.org/node/885
- *LSST Telescope Design Developments* (poster) — https://wp.optics.arizona.edu/loft/wp-content/uploads/sites/6/2025/03/LSST_Telescope_Design_Developments.pdf
- Ivezić et al. 2019, *LSST: from Science Drivers to Reference Design and Anticipated Data Products*, ApJ 873, 111 — https://arxiv.org/abs/0805.2366

### Official Rubin Observatory material

- *NSF–DOE Vera C. Rubin Observatory Media Kit*, 12 Feb 2026 — https://storage.googleapis.com/rubin-obs-prod-assets_general/20260212-NSF%E2%80%93DOE-Vera-C.-Rubin-Observatory-Media-Kit.pdf (naming rules, key numbers in captions, M1M3 cell size, dome finish, shutter 0.9 s, camera exploded view and colours, summit layout)
- Rubin 101: telescopes and key numbers — https://rubinobservatory.org/for-scientists/rubin-101/telescopes ; https://rubinobservatory.org/for-scientists/rubin-101/key-numbers (slew and settle, axis speeds, dome speed, field of view)
- Summit facility and mount pages — https://rubinobservatory.org/explore/technology/summit-facility ; https://rubinobservatory.org/explore/technology/mount
- Sky & Telescope, June 2024 cutaway of the observatory — https://skyandtelescope.org/astronomy-news/vera-rubin-observatory-astronomys-new-workhorse/ (dome, pier, platform lift, cell mass)
- NOIRLab 3D models (reference for the overall shapes) — https://noirlab.edu/public/products/models3d/Rubin-CAD-201801

### Visual references (not reproduced)

Used only to sample colours and shapes; no pixel of these images is in the site.

- On-site photos of the summit, dome, TMA and LSSTCam, LSSTCam CAD views and a satellite view of the summit (provided by Alexandre Boucaud)
- CNRS animation of the LSSTCam filter exchanger and IN2P3 LSST camera posters (carousel ring Ø 1400 mm, 550 teeth)
- Photo of an autochanger side plate (groove and ball-screw layout)
- Cutaway drawing of the observatory by Alexandra Claraz

### Software

- [three.js](https://github.com/mrdoob/three.js) (WebGL rendering, post-processing, sky model), [lil-gui](https://github.com/georgealways/lil-gui), [Vite](https://github.com/vitejs/vite), [TypeScript](https://github.com/microsoft/TypeScript)
- [Playwright](https://github.com/microsoft/playwright) for the screenshots (`tools/shot.cjs`)
