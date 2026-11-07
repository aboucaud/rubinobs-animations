// The six LSST bands: one place for their display colours and descriptions.
import type { Band } from '../optics/trace';
export { BANDS } from '../optics/trace';
export type { Band } from '../optics/trace';

/** Display colour of each band (i, z and y are infrared: false colour). */
export const BAND_HEX: Record<Band, string> = {
  u: '#9b6bff',
  g: '#34b8ff',
  r: '#ff6a2e',
  i: '#ff2f5e',
  z: '#e04bff',
  y: '#ffd43a',
};

export const BAND_INFO: Record<Band, { range: string; note: string; falseColour: boolean }> = {
  u: { range: '320–390 nm', note: 'near-ultraviolet', falseColour: false },
  g: { range: '400–550 nm', note: 'blue-green', falseColour: false },
  r: { range: '550–690 nm', note: 'red', falseColour: false },
  i: { range: '690–820 nm', note: 'near-infrared', falseColour: true },
  z: { range: '820–925 nm', note: 'infrared', falseColour: true },
  y: { range: '930–1010 nm', note: 'infrared', falseColour: true },
};
