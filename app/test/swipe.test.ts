import { describe, expect, it } from 'vitest';
import { dragShift, FAR, swipeAxis, swipeEnd, SLOP } from '../src/logic/swipe';

describe('swipeAxis', () => {
  it('decides nothing while the finger has barely moved, so a tap stays a tap', () => {
    expect(swipeAxis(0, 0)).toBeNull();
    expect(swipeAxis(SLOP - 1, 0)).toBeNull();
    expect(swipeAxis(4, 5)).toBeNull();
  });

  it('a clearly sideways move is a swipe', () => {
    expect(swipeAxis(30, 5)).toBe('x');
    expect(swipeAxis(-30, -8)).toBe('x');
  });

  it('a vertical or diagonal move is left to scrolling', () => {
    expect(swipeAxis(2, 30)).toBe('y');
    expect(swipeAxis(20, 18)).toBe('y');
    expect(swipeAxis(-12, -40)).toBe('y');
  });
});

describe('swipeEnd', () => {
  it('in Arabic, a finger moving from left to right brings the next step in from the left', () => {
    expect(swipeEnd(120, 400)).toBe('forward');
  });

  it('right to left goes back', () => {
    expect(swipeEnd(-120, 400)).toBe('back');
  });

  it('a short slow drag snaps back', () => {
    expect(swipeEnd(40, 600)).toBeNull();
    expect(swipeEnd(-40, 600)).toBeNull();
  });

  it('a very short move never counts, however quick', () => {
    expect(swipeEnd(35, 1)).toBeNull();
  });

  it('a short quick flick counts', () => {
    expect(swipeEnd(45, 80)).toBe('forward');
    expect(swipeEnd(-45, 80)).toBe('back');
  });

  it('a long drag counts, however slow', () => {
    expect(swipeEnd(FAR, 2000)).toBe('forward');
    expect(swipeEnd(FAR - 1, 2000)).toBeNull();
    expect(swipeEnd(-100, 2000)).toBe('back');
  });
});

describe('dragShift', () => {
  it('follows the finger where it can go', () => {
    expect(dragShift(60, true, true)).toBe(60);
    expect(dragShift(-60, true, true)).toBe(-60);
  });

  it('resists where it cannot: a step that cannot continue yet, or the first step', () => {
    expect(dragShift(60, false, true)).toBe(15);
    expect(dragShift(-60, true, false)).toBe(-15);
  });
});
