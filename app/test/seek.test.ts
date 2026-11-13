import { describe, expect, it } from 'vitest';
import { clampSeek, formatTime, keyTarget, pointerToTime, SKIP_SECONDS, skipTarget } from '../src/logic/seek';

// A lesson recording just under an hour.
const LESSON = 58 * 60 + 41;

describe('clampSeek', () => {
  it('keeps a time inside the recording', () => {
    expect(clampSeek(120, LESSON)).toBe(120);
    expect(clampSeek(-3, LESSON)).toBe(0);
    expect(clampSeek(LESSON + 30, LESSON)).toBe(LESSON);
  });

  it('only clamps at zero while the duration is unknown', () => {
    expect(clampSeek(500, 0)).toBe(500);
    expect(clampSeek(-1, NaN)).toBe(0);
  });

  it('treats a non-number target as the start', () => {
    expect(clampSeek(NaN, LESSON)).toBe(0);
  });
});

describe('skipTarget', () => {
  it('moves 15 seconds either way', () => {
    expect(SKIP_SECONDS).toBe(15);
    expect(skipTarget(600, LESSON, -SKIP_SECONDS)).toBe(585);
    expect(skipTarget(600, LESSON, SKIP_SECONDS)).toBe(615);
  });

  it('stops at the start and at the end', () => {
    expect(skipTarget(7, LESSON, -SKIP_SECONDS)).toBe(0);
    expect(skipTarget(LESSON - 4, LESSON, SKIP_SECONDS)).toBe(LESSON);
  });
});

describe('pointerToTime', () => {
  const rail = { left: 100, width: 200 };

  it('maps the pointer along a left-to-right rail', () => {
    expect(pointerToTime(100, rail, LESSON, 'ltr')).toBe(0);
    expect(pointerToTime(200, rail, LESSON, 'ltr')).toBeCloseTo(LESSON / 2);
    expect(pointerToTime(300, rail, LESSON, 'ltr')).toBe(LESSON);
  });

  it('maps the pointer along a right-to-left rail', () => {
    expect(pointerToTime(300, rail, LESSON, 'rtl')).toBe(0);
    expect(pointerToTime(150, rail, LESSON, 'rtl')).toBeCloseTo((LESSON * 3) / 4);
  });

  it('clamps a pointer dragged past either end', () => {
    expect(pointerToTime(20, rail, LESSON, 'ltr')).toBe(0);
    expect(pointerToTime(900, rail, LESSON, 'ltr')).toBe(LESSON);
  });

  it('gives the start for an unmeasured rail or an unknown duration', () => {
    expect(pointerToTime(150, { left: 0, width: 0 }, LESSON, 'ltr')).toBe(0);
    expect(pointerToTime(150, rail, 0, 'ltr')).toBe(0);
  });
});

describe('keyTarget', () => {
  it('moves with the arrows the way the bar fills', () => {
    expect(keyTarget('ArrowRight', 600, LESSON)).toBe(615);
    expect(keyTarget('ArrowUp', 600, LESSON)).toBe(615);
    expect(keyTarget('ArrowLeft', 600, LESSON)).toBe(585);
    expect(keyTarget('ArrowDown', 600, LESSON)).toBe(585);
  });

  it('jumps to the ends with Home and End', () => {
    expect(keyTarget('Home', 600, LESSON)).toBe(0);
    expect(keyTarget('End', 600, LESSON)).toBe(LESSON);
  });

  it('ignores other keys', () => {
    expect(keyTarget('Enter', 600, LESSON)).toBeNull();
  });
});

describe('formatTime', () => {
  it('writes minutes and seconds in Arabic digits', () => {
    expect(formatTime(0)).toBe('٠:٠٠');
    expect(formatTime(65)).toBe('١:٠٥');
    expect(formatTime(LESSON)).toBe('٥٨:٤١');
  });

  it('drops fractions of a second', () => {
    expect(formatTime(59.9)).toBe('٠:٥٩');
  });

  it('adds hours from one hour up', () => {
    expect(formatTime(3600)).toBe('١:٠٠:٠٠');
    expect(formatTime(2 * 3600 + 7 * 60 + 3)).toBe('٢:٠٧:٠٣');
  });

  it('writes hours for a short time when the recording is an hour or longer, so both labels keep their shape', () => {
    expect(formatTime(120, 3600)).toBe('٠:٠٢:٠٠');
    expect(formatTime(120, LESSON)).toBe('٢:٠٠');
  });

  it('shows a placeholder for an unknown time', () => {
    expect(formatTime(NaN)).toBe('--:--');
    expect(formatTime(Infinity)).toBe('--:--');
    expect(formatTime(-1)).toBe('--:--');
  });
});
