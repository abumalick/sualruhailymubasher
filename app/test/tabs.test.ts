import { describe, expect, it } from 'vitest';
import type { StateDTO } from '@albadr/shared';
import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { defaultTab, lessonTabs } from '../src/logic/tabs';
import { liveDTO } from './live-state';

const [tafsir, tawhid] = FIXTURE_STATE.courses;
const MON_0940 = new Date('2026-11-02T06:40:00Z');
const MON_1900 = new Date('2026-11-02T16:00:00Z');
const MON_2110 = new Date('2026-11-02T18:10:00Z');
const withCourses = (courses: StateDTO['courses'], live = FIXTURE_STATE.live): StateDTO => ({ ...FIXTURE_STATE, courses, live });

describe('defaultTab', () => {
  it('opens the soonest current or next lesson', () => {
    expect(defaultTab(FIXTURE_STATE, MON_0940)).toBe('kitab-tawhid');
    expect(defaultTab(FIXTURE_STATE, MON_1900)).toBe('kitab-tawhid');
    expect(defaultTab(FIXTURE_STATE, MON_2110)).toBe('tafsir-saadi');
  });

  it('opens the lesson on air', () => {
    expect(defaultTab(withCourses(FIXTURE_STATE.courses, liveDTO('tafsir-saadi')), MON_1900)).toBe('tafsir-saadi');
  });

  it('ignores a broadcast of a course that is not followed', () => {
    expect(defaultTab(withCourses([tawhid], liveDTO('tafsir-saadi')), MON_2110)).toBe('kitab-tawhid');
  });

  it('falls back to the first tab when nothing is scheduled', () => {
    expect(defaultTab(withCourses([{ ...tawhid, next: null }, { ...tafsir, next: null }]), MON_0940)).toBe('tafsir-saadi');
  });

  it('one course gives that course, none gives null', () => {
    expect(defaultTab(withCourses([tafsir]), MON_0940)).toBe('tafsir-saadi');
    expect(defaultTab(withCourses([]), MON_0940)).toBeNull();
  });
});

describe('lessonTabs', () => {
  it('puts fajr first even when the server lists maghrib first', () => {
    expect(lessonTabs(withCourses([tawhid, tafsir])).map((t) => [t.courseId, t.slot, t.label])).toEqual([
      ['tafsir-saadi', 'fajr', 'الفجر'],
      ['kitab-tawhid', 'maghrib', 'المغرب'],
    ]);
  });

  it('labels two courses of one slot by their titles', () => {
    const second = { ...tawhid, id: 'other', title: 'كتاب آخر' };
    expect(lessonTabs(withCourses([tawhid, second])).map((t) => t.label)).toEqual([tawhid.title, 'كتاب آخر']);
  });

  it('marks only the course on air as live', () => {
    expect(lessonTabs(withCourses(FIXTURE_STATE.courses, liveDTO('kitab-tawhid'))).map((t) => t.live)).toEqual([false, true]);
  });

  it('has no tabs without a state', () => {
    expect(lessonTabs(null)).toEqual([]);
  });
});
