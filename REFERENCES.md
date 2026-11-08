# References

Everything the animations are built from. Keep this list up to date when a new source is used (code, data, document or visual reference).

## Public repositories and data (used directly by the code)

| Source | Used for |
|---|---|
| [jmeyers314/batoid](https://github.com/jmeyers314/batoid) — `batoid/data/LSST/LSST_{u,g,r,i,z,y}.yaml`, `LSST_r_baffles_LTS-213.yaml` | optical prescription of every surface (`src/data/prescription.json`, exported by `tools/export_prescription.py`), baffles, spider and camera-body obscurations, reference traces for `npm run validate` |
| [lsst/obs_lsst](https://github.com/lsst/obs_lsst) — `policy/cameraHeader.yaml`, `policy/rafts.yaml`, `policy/lsstCam/R*.yaml` | focal-plane layout: raft and CCD positions, e2v / ITL sensor sizes, corner guiders and wavefront sensors |
| [lsst/throughputs](https://github.com/lsst/throughputs) — `baseline/filter_*.dat` | filter transmission curves → filter colours in reflection and transmission (`tools/filter_colours.py`) |
| [lsst-ts/ts_xml](https://github.com/lsst-ts/ts_xml) — `python/lsst/ts/xml/tables/m1m3/fa_table.py` | M1M3 actuator count and extent; height of the elevation axis above the M1 vertex (inferred) |
| [lsst/rubin_scheduler](https://github.com/lsst/rubin_scheduler) v4.6.1 — `scheduler/utils/sky_area.py` (`Phase3AreaMap`), `scheduler/example/lsst_surveys.py`, `scheduler/model_observatory/kinem_model.py`, `scheduler/schedulers/filter_scheduler.py`, `utils/site.py`, `utils/rotskypos.py` | survey footprint regions and band ratios, blob pairs and pair time, exposure times, mount / dome / optics timings, u ↔ y filter swap with the Moon, site coordinates, rotSkyPos convention (survey page) |
| [ofrohn/d3-celestial](https://github.com/ofrohn/d3-celestial) v0.7.35 (BSD-3-Clause) — `data/stars.6.json`, `data/mw.json` | stars to V = 6 from the XHIP compilation (Anderson & Francis 2012, VizieR V/137D) and the Milky Way outline catalogue of J. R. Vieira (survey page background, `tools/sky_data.py`) |
| *The Astronomical Almanac*, low-precision formulae for the Sun and the Moon; IAU 1982 GMST | Sun, Moon, illumination and sidereal time on the survey page (`src/survey/astro.ts`) |
| Hipparcos (ESA 1997) equatorial → galactic rotation matrix | galactic plane and footprint regions |
| viridis colour map (van der Walt & Smith, matplotlib), polynomial fit | "Visits" map colour scale |
| Wyman, Sloan & Shirley 2013, *Simple Analytic Approximations to the CIE XYZ Color Matching Functions*, JCGT 2(2) | CIE 1931 colour-matching functions used for the filter colours |

## Rubin technical documents

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
- Bianco et al. 2022, *Optimization of the Observing Cadence for the Rubin Observatory Legacy Survey of Space and Time*, ApJS 258, 1 — https://arxiv.org/abs/2108.01683 (survey strategy and the Survey Cadence Optimization Committee)
- Naghib et al. 2019, *A framework for telescope schedulers: with applications to the Large Synoptic Survey Telescope*, AJ 157, 151 — https://arxiv.org/abs/1810.04815 (feature-based scheduler)
- Ivezić et al. 2019, *LSST: from Science Drivers to Reference Design and Anticipated Data Products*, ApJ 873, 111 — https://arxiv.org/abs/0805.2366

## Official Rubin Observatory material

- *NSF–DOE Vera C. Rubin Observatory Media Kit*, 12 Feb 2026 — https://storage.googleapis.com/rubin-obs-prod-assets_general/20260212-NSF%E2%80%93DOE-Vera-C.-Rubin-Observatory-Media-Kit.pdf (naming rules, key numbers in captions, M1M3 cell size, dome finish, shutter 0.9 s, camera exploded view and colours, summit layout)
- Rubin 101: telescopes and key numbers — https://rubinobservatory.org/for-scientists/rubin-101/telescopes ; https://rubinobservatory.org/for-scientists/rubin-101/key-numbers (slew and settle, axis speeds, dome speed, field of view)
- Summit facility and mount pages — https://rubinobservatory.org/explore/technology/summit-facility ; https://rubinobservatory.org/explore/technology/mount
- Sky & Telescope, June 2024 cutaway of the observatory — https://skyandtelescope.org/astronomy-news/vera-rubin-observatory-astronomys-new-workhorse/ (dome, pier, platform lift, cell mass)
- NOIRLab 3D models (reference for the overall shapes) — https://noirlab.edu/public/products/models3d/Rubin-CAD-201801

## Visual references (not reproduced)

Used only to sample colours and shapes; no pixel of these images is in the site.

- On-site photos of the summit, dome, TMA and LSSTCam, LSSTCam CAD views and a satellite view of the summit (provided by Alexandre Boucaud)
- CNRS animation of the LSSTCam filter exchanger and IN2P3 LSST camera posters (carousel ring Ø 1400 mm, 550 teeth)
- Photo of an autochanger side plate (groove and ball-screw layout)
- Cutaway drawing of the observatory by Alexandra Claraz

## Software

- [three.js](https://github.com/mrdoob/three.js) (WebGL rendering, post-processing, sky model), [lil-gui](https://github.com/georgealways/lil-gui), [Vite](https://github.com/vitejs/vite), [TypeScript](https://github.com/microsoft/TypeScript)
- [Playwright](https://github.com/microsoft/playwright) for the screenshots (`tools/shot.cjs`)
