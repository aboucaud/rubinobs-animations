// Timings of the LSSTCam filter exchange (FES paper, arXiv:2606.31995): shared by the filter animation
// (fes.ts) and the survey scheduler. Kept free of three.js so the scheduler can import it alone.

/** Duration (s, real camera) of each step of an exchange; also used by the survey scheduler. */
export const FES_TIMES = { checks: 3, unclamp: 5, ret: 14, lock: 6, turn1: 26, turn2: 30.5, grab: 6, insert: 14, clamp: 8, stored: 1 };

/** Duration of a full exchange between two filters `slots` carousel positions apart (1 or 2). */
export const exchangeTime = (slots: number) => {
  const t = FES_TIMES;
  return t.checks + t.unclamp + t.ret + t.lock + (slots === 1 ? t.turn1 : t.turn2) + t.grab + t.insert + t.clamp;
};
