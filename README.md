# rubinobs-animations

Interactive, physically accurate outreach animations of the Vera C. Rubin Observatory, the Simonyi Survey Telescope and the LSST Camera (LSSTCam).

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
npm run build      # static site in dist/
npx tsx tools/validate.ts   # compare the ray tracer with batoid
```

To regenerate the prescription data (needs `pip install batoid`):

```bash
cd tools && python3 export_prescription.py
```

## Status

v0.1: telescope only. Exact optics and baffles; the mount (TMA), mirror cell, centre section and camera internals are schematic placeholders until the NOIRLab CAD is integrated.
