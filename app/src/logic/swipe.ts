// Swiping between the onboarding's steps. The app is in Arabic: the next step sits on the left, so it comes in from
// the left when the finger moves from left to right (dx > 0).

// How far the finger moves before a touch is read as a swipe or a scroll; below it, it is a tap.
export const SLOP = 10;

export function swipeAxis(dx: number, dy: number): 'x' | 'y' | null {
  if (Math.hypot(dx, dy) < SLOP) return null;
  return Math.abs(dx) > Math.abs(dy) * 1.5 ? 'x' : 'y';
}

// Where a sideways swipe ends: far enough (a quarter of a small phone's width), or a quick flick, changes step;
// otherwise it snaps back.
export const FAR = 80;
export function swipeEnd(dx: number, ms: number): 'forward' | 'back' | null {
  const far = Math.abs(dx) >= FAR;
  const flick = Math.abs(dx) >= 40 && Math.abs(dx) / Math.max(ms, 1) >= 0.3;
  if (!far && !flick) return null;
  return dx > 0 ? 'forward' : 'back';
}

// How far the step follows the finger: all the way where it can go, a quarter where it cannot.
export const dragShift = (dx: number, canForward: boolean, canBack: boolean): number => ((dx > 0 ? canForward : canBack) ? dx : dx / 4);
