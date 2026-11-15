import { describe, expect, it } from 'vitest';
import type { StateDTO } from '@sualruhaily/shared';
import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { defaultTab, lessonTabs } from '../src/logic/tabs';
import { liveDTO } from './live-state';

const [tafsir, tawhid] = FIXTURE_STATE.courses;
const MON_0940 = new Date('2026-11-02T06:40:00Z');
const MON_1600 = new Date('2026-11-02T13:00:00Z');
const MON_2110 = new Date('2026-11-02T18:10:00Z');
const withCourses = (courses: StateDTO['courses'], live = FIXTURE_STATE.live): StateDTO => ({ ...FIXTURE_STATE, courses, live });

describe('defaultTab', () => {
  it('opens the soonest current or next lesson', () => {
    expect(defaultTab(FIXTURE_STATE, MON_0940)).toBe('kabair');
    expect(defaultTab(FIXTURE_STATE, MON_1600)).toBe('kabair');
    expect(defaultTab(FIXTURE_STATE, MON_2110)).toBe('kitab-tawhid');
  });

  it('opens the lesson on air', () => {
    expect(defaultTab(withCourses(FIXTURE_STATE.courses, liveDTO('kitab-tawhid')), MON_1600)).toBe('kitab-tawhid');
  });

  it('opens the soonest of the lessons the listener attends', () => {
    expect(defaultTab(FIXTURE_STATE, MON_0940, ['kitab-tawhid'])).toBe('kitab-tawhid');
    expect(defaultTab(FIXTURE_STATE, MON_2110, ['kabair'])).toBe('kabair');
  });

  it('a broadcast on air wins over the lessons the listener attends', () => {
    expect(defaultTab(withCourses(FIXTURE_STATE.courses, liveDTO('kabair')), MON_2110, ['kitab-tawhid'])).toBe('kabair');
  });

  it('ignores a broadcast of a course that is not listed', () => {
    expect(defaultTab(withCourses([tawhid], liveDTO('kitab-tawhid')), MON_2110)).toBe('kabair');
  });

  it('falls back to the first tab when nothing is scheduled', () => {
    expect(defaultTab(withCourses([{ ...tawhid, next: null }, { ...tafsir, next: null }]), MON_0940)).toBe('kitab-tawhid');
  });

  it('one course gives that course, none gives null', () => {
    expect(defaultTab(withCourses([tafsir]), MON_0940)).toBe('kitab-tawhid');
    expect(defaultTab(withCourses([]), MON_0940)).toBeNull();
  });
});

describe('lessonTabs', () => {
  it('puts fajr first even when the server lists maghrib first', () => {
    expect(lessonTabs(withCourses([tawhid, tafsir])).map((t) => [t.courseId, t.slot, t.label])).toEqual([
      ['kitab-tawhid', 'fajr', 'الفجر'],
      ['kabair', 'asr', 'العصر'],
    ]);
  });

  it('orders fajr, asr, maghrib and names the asr tab', () => {
    const maghrib = { ...tawhid, id: 'm', slot: 'maghrib' as const };
    expect(lessonTabs(withCourses([maghrib, tawhid, tafsir])).map((t) => [t.slot, t.label])).toEqual([
      ['fajr', 'الفجر'],
      ['asr', 'العصر'],
      ['maghrib', 'المغرب'],
    ]);
  });

  it('labels two courses of one slot by their titles', () => {
    const second = { ...tawhid, id: 'other', title: 'كتاب آخر' };
    expect(lessonTabs(withCourses([tawhid, second])).map((t) => t.label)).toEqual([tawhid.title, 'كتاب آخر']);
  });

  it('marks only the course on air as live', () => {
    expect(lessonTabs(withCourses(FIXTURE_STATE.courses, liveDTO('kabair'))).map((t) => t.live)).toEqual([false, true]);
  });

  it('has no tabs without a state', () => {
    expect(lessonTabs(null)).toEqual([]);
  });
});
