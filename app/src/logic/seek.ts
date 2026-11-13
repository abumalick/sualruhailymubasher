import { toArabicDigits } from '@albadr/shared';

export const SKIP_SECONDS = 15;

const known = (n: number) => Number.isFinite(n) && n > 0;

export function clampSeek(target: number, duration: number): number {
  if (!Number.isFinite(target) || target < 0) return 0;
  return known(duration) ? Math.min(target, duration) : target;
}

export const skipTarget = (position: number, duration: number, delta: number) => clampSeek(position + delta, duration);

export function pointerToTime(x: number, rail: { left: number; width: number }, duration: number, dir: 'ltr' | 'rtl'): number {
  if (rail.width <= 0 || !known(duration)) return 0;
  const along = (x - rail.left) / rail.width;
  const frac = Math.min(1, Math.max(0, dir === 'ltr' ? along : 1 - along));
  return frac * duration;
}

// The scrubber is drawn left to right in every language, so ArrowRight always moves forward.
const KEY_DELTA: Record<string, number> = { ArrowRight: SKIP_SECONDS, ArrowUp: SKIP_SECONDS, ArrowLeft: -SKIP_SECONDS, ArrowDown: -SKIP_SECONDS };

export function keyTarget(key: string, position: number, duration: number): number | null {
  if (key === 'Home') return 0;
  if (key === 'End') return clampSeek(duration, duration);
  return key in KEY_DELTA ? skipTarget(position, duration, KEY_DELTA[key]) : null;
}

const two = (n: number) => toArabicDigits(n).padStart(2, '٠');

export function formatTime(sec: number, duration = sec): string {
  if (!Number.isFinite(sec) || sec < 0) return '--:--';
  const t = Math.floor(sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = two(t % 60);
  return h > 0 || duration >= 3600 ? `${toArabicDigits(h)}:${two(m)}:${s}` : `${toArabicDigits(m)}:${s}`;
}
