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
