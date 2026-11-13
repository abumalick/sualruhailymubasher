import { describe, expect, it } from 'vitest';
import type { StateDTO } from '@albadr/shared';
import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { liveIntentAction } from '../src/logic/liveIntent';
import { liveDTO } from './live-state';

const onAir = (courseId: string | null): StateDTO => ({ ...FIXTURE_STATE, live: liveDTO(courseId) });
const tawhid = { courseId: 'kitab-tawhid' };

describe('liveIntentAction', () => {
  it('waits for the first fresh state', () => {
    expect(liveIntentAction(tawhid, onAir('kitab-tawhid'), false, false)).toBe('wait');
    expect(liveIntentAction(tawhid, null, false, false)).toBe('wait');
  });

  it('opens on a matching broadcast', () => {
    expect(liveIntentAction(tawhid, onAir('kitab-tawhid'), true, false)).toBe('open');
  });

  it('drops a stale intent', () => {
    expect(liveIntentAction(tawhid, FIXTURE_STATE, true, false)).toBe('drop');
  });

  it('drops an intent for another course', () => {
    expect(liveIntentAction(tawhid, onAir('tafsir-saadi'), true, false)).toBe('drop');
  });

  it('opens when the fetch failed', () => {
    expect(liveIntentAction(tawhid, FIXTURE_STATE, false, true)).toBe('open');
    expect(liveIntentAction(tawhid, null, false, true)).toBe('open');
  });

  it('a course-less intent matches only a course-less broadcast', () => {
    expect(liveIntentAction({ courseId: null }, onAir(null), true, false)).toBe('open');
    expect(liveIntentAction({ courseId: null }, onAir('kitab-tawhid'), true, false)).toBe('drop');
  });
});
