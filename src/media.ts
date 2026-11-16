// The rendered film and its home-page loop. The videos are hosted outside this repository
// (storyboard D8: they would add ~40 MB to the git history at every new render), so the site only
// knows their addresses, all of them here. The posters are small and ship with the site.
//
// The host must serve them over HTTPS, with the right Content-Type (video/webm, video/mp4), HTTP
// range requests and no forced download (Content-Disposition: attachment); if a file is missing,
// the poster stays. After a new render, upload the files there under the same names.
import loopPoster from './media/film-loop.jpg';
import filmPoster from './media/film-poster.jpg';

const VIDEO_BASE = 'https://me.lsst.eu/aboucaud/videos/';

export interface Video {
  /** AV1 in WebM: small, played by current browsers */
  webm: string;
  /** H.264 in MP4: fallback for browsers without AV1 */
  mp4: string;
  poster: string;
}

export const MEDIA: Record<'loop' | 'film', Video> = {
  // 31.5–42 s of the film, no text, 1280×720 (`node tools/film.cjs loop`)
  loop: { webm: `${VIDEO_BASE}film-loop.webm`, mp4: `${VIDEO_BASE}film-loop.mp4`, poster: loopPoster },
  // the whole film with titles and closing card, 1920×1080 (`node tools/film.cjs compose`)
  film: { webm: `${VIDEO_BASE}film.webm`, mp4: `${VIDEO_BASE}film.mp4`, poster: filmPoster },
};

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Fill a <video> with the sources of `v` (AV1 first, H.264 as fallback) and its poster.
 * `ambient`: muted, looping and autoplaying background video, except for viewers who asked for
 * reduced motion, who only get the poster.
 */
export function mountVideo(el: HTMLVideoElement, v: Video, ambient = false) {
  el.poster = v.poster;
  el.playsInline = true;
  for (const [src, type] of [
    [v.webm, 'video/webm; codecs="av01.0.08M.08"'],
    [v.mp4, 'video/mp4'],
  ]) {
    const s = document.createElement('source');
    s.src = src;
    s.type = type;
    el.appendChild(s);
  }
  if (ambient) {
    el.muted = true; // browsers only autoplay muted videos
    el.loop = true;
    el.setAttribute('aria-hidden', 'true');
    const apply = () => {
      if (REDUCED_MOTION.matches) {
        el.pause();
        el.preload = 'none';
      } else {
        el.preload = 'auto';
        el.load();
        el.play().catch(() => {}); // autoplay refused or file missing: the poster stays
      }
    };
    apply();
    REDUCED_MOTION.addEventListener('change', apply);
  } else {
    el.preload = 'metadata';
    el.load();
  }
}
