import type { CourseDTO } from '@albadr/shared';
import { describe, expect, it } from 'vitest';
import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { attended, kindsOf, migratePrefs, reconcilePrefs, subscriptionPlan, type Follow, type Prefs } from '../src/logic/prefs';
import { topicsFor } from '../src/logic/topics';

const [TAFSIR, TAWHID] = FIXTURE_STATE.courses;
const book = (id: string, from: CourseDTO): CourseDTO => ({ ...from, id });
const follow = (ids: string[], courses = FIXTURE_STATE.courses): Follow => ({
  ids,
  known: Object.fromEntries(courses.map((c) => [c.id, c.slot])),
  fresh: [],
  hint: false,
});

describe('reconcilePrefs', () => {
  const both: Prefs = { wanted: ['c-kitab-tawhid-live'], known: [['tafsir-saadi', 'fajr'], ['kitab-tawhid', 'maghrib']] };

  it('returns the same record when no course is new', () => {
    expect(reconcilePrefs(both, [TAFSIR, TAWHID])).toBe(both);
  });

  it('a paused course keeps its switches while unlisted and when it comes back', () => {
    const paused = reconcilePrefs(both, [TAFSIR]);
    expect(paused.wanted).toContain('c-kitab-tawhid-live');
    expect(reconcilePrefs(paused, [TAFSIR, TAWHID]).wanted).toEqual(both.wanted);
  });

  it('a new book inherits the kinds of the last course of its slot', () => {
    const p: Prefs = { wanted: ['c-tafsir-saadi-rec', 'c-tafsir-saadi-prep'], known: [['tafsir-saadi', 'fajr']] };
    const next = reconcilePrefs(p, [TAFSIR, book('tafsir-2', TAFSIR)]);
    expect(kindsOf(next, 'tafsir-2')).toEqual(['rec', 'prep']);
    expect(next.known.at(-1)).toEqual(['tafsir-2', 'fajr']);
  });

  it('a new book after a gap still inherits from the book that left', () => {
    const p: Prefs = { wanted: ['c-tafsir-saadi-live'], known: [['tafsir-saadi', 'fajr']] };
    const gap = reconcilePrefs(p, []);
    expect(kindsOf(reconcilePrefs(gap, [book('tafsir-2', TAFSIR)]), 'tafsir-2')).toEqual(['live']);
  });

  it('a switch turned off on the second book stays off on the third', () => {
    const p: Prefs = { wanted: topicsFor(['b1']).filter((t) => t !== 'live-other'), known: [['b1', 'fajr']] };
    const two = reconcilePrefs(p, [book('b2', TAFSIR)]);
    const off = { ...two, wanted: two.wanted.filter((t) => t !== 'c-b2-prep') };
    expect(kindsOf(reconcilePrefs(off, [book('b3', TAFSIR)]), 'b3')).toEqual(['live', 'rec']);
  });

  it('a course in a slot nobody had gets nothing', () => {
    const p: Prefs = { wanted: topicsFor(['tafsir-saadi']), known: [['tafsir-saadi', 'fajr']] };
    const next = reconcilePrefs(p, [TAFSIR, TAWHID]);
    expect(kindsOf(next, 'kitab-tawhid')).toEqual([]);
    expect(next.known.map(([id]) => id)).toEqual(['tafsir-saadi', 'kitab-tawhid']);
  });
});

describe('migratePrefs', () => {
  const courses = FIXTURE_STATE.courses;

  it('keeps stored topics and the follow record decides nothing more', () => {
    const topics = [...topicsFor(['tafsir-saadi'])];
    const p = migratePrefs({ topics, topicCourses: ['tafsir-saadi'], follow: follow(['tafsir-saadi']) }, courses)!;
    expect(p.wanted.sort()).toEqual([...topics].sort());
    expect(p.known).toEqual([['tafsir-saadi', 'fajr'], ['kitab-tawhid', 'maghrib']]);
  });

  it('takes the slot of a course that left from the follow record', () => {
    const f = { ...follow(['old']), known: { old: 'maghrib' as const } };
    const p = migratePrefs({ topics: ['c-old-live'], topicCourses: ['old'], follow: f }, courses)!;
    expect(p.known).toContainEqual(['old', 'maghrib']);
  });

  it('a follow record without stored topics gets its lessons and live-other', () => {
    const p = migratePrefs({ topics: null, topicCourses: null, follow: follow(['tafsir-saadi']) }, courses)!;
    expect(p.wanted.sort()).toEqual(topicsFor(['tafsir-saadi']).sort());
  });

  it('nothing stored is a new listener', () => {
    expect(migratePrefs({ topics: null, topicCourses: null, follow: null }, courses)).toBeNull();
  });
});

describe('subscriptionPlan', () => {
  it('subscribes only listed courses and drops what is not wanted', () => {
    const p: Prefs = { wanted: ['c-tafsir-saadi-live', 'c-kitab-tawhid-rec', 'live-other'], known: [['tafsir-saadi', 'fajr'], ['kitab-tawhid', 'maghrib']] };
    const plan = subscriptionPlan(p, ['tafsir-saadi'], ['c-kitab-tawhid-rec', 'c-tafsir-saadi-prep']);
    expect(plan.wanted.sort()).toEqual(['c-tafsir-saadi-live', 'live-other']);
    expect(plan.sub.sort()).toEqual(['c-tafsir-saadi-live', 'live-other']);
    expect(plan.unsub.sort()).toEqual(['c-kitab-tawhid-rec', 'c-tafsir-saadi-prep', 'c-tafsir-saadi-rec']);
  });
});

describe('attended', () => {
  const known: Prefs['known'] = [['tafsir-saadi', 'fajr'], ['kitab-tawhid', 'maghrib']];

  it('is the lessons with at least one switch on', () => {
    expect(attended({ wanted: ['c-tafsir-saadi-prep', 'live-other'], known }, FIXTURE_STATE.courses)).toEqual(['tafsir-saadi']);
  });

  it('is every lesson when none has a switch on', () => {
    expect(attended({ wanted: ['live-other'], known }, FIXTURE_STATE.courses)).toEqual(['tafsir-saadi', 'kitab-tawhid']);
    expect(attended(null, FIXTURE_STATE.courses)).toEqual(['tafsir-saadi', 'kitab-tawhid']);
  });
});
