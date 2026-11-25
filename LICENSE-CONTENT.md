# Licence of the content (images, videos, texts)

The **code** of this repository is under the MIT licence (`LICENSE`).

The **content** is under the **Creative Commons Attribution 4.0 International** licence (CC BY 4.0):
https://creativecommons.org/licenses/by/4.0/ (full legal text: https://creativecommons.org/licenses/by/4.0/legalcode).

Content means:
- the rendered film and its home-page loop (`film.webm`, `film.mp4`, `film-loop.webm`, `film-loop.mp4`, hosted outside the repository, see `src/media.ts`), and their posters (`src/media/`);
- the page thumbnails (`public/thumbs/`) and the site icon (`public/favicon.svg`);
- screenshots, frames and recordings of the animations;
- the explanatory texts shown on the pages.

You may share and adapt all of it, for any purpose, including commercially, as long as you give credit. Suggested credit:

> Rubin Observatory outreach animations, A. Boucaud and contributors, CC BY 4.0 — https://aboucaud.github.io/rubinobs-animations/

## Not covered by these licences

- **Names and logos.** "NSF–DOE Vera C. Rubin Observatory", "Rubin Observatory", "Simonyi Survey Telescope", "LSST Camera" and the Rubin, NSF, DOE, IN2P3 and CNRS names are used to describe what is shown; no logo is reproduced. This is not an official Rubin Observatory product.
- **Third-party software and data**, which keep their own licences:
  - [batoid](https://github.com/jmeyers314/batoid) (BSD 2-Clause, © Josh Meyers): the optical prescription and baffle model in `src/data/prescription.json` and `src/data/baffles.json` are exported from it;
  - [obs_lsst](https://github.com/lsst/obs_lsst) (GPL-3.0): only numerical facts of the focal-plane layout (raft and CCD positions and sizes) are used, no code;
  - [lsst/throughputs](https://github.com/lsst/throughputs): the filter curves are downloaded on use and not redistributed; only the derived colours are in `src/data/filter_colours.json`;
  - three.js and lil-gui (MIT), the Inter typeface (SIL Open Font License 1.1).
- **Visual references** (photos, CAD views, drawings listed in `REFERENCES.md`) are not part of the site and are not licensed here.
