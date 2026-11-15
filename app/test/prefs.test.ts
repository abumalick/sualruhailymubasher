import type { CourseDTO } from '@sualruhaily/shared';
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
  const both: Prefs = { wanted: ['c-kabair-live'], known: [['kitab-tawhid', 'fajr'], ['kabair', 'asr']] };

  it('returns the same record when no course is new', () => {
    expect(reconcilePrefs(both, [TAFSIR, TAWHID])).toBe(both);
  });

  it('a paused course keeps its switches while unlisted and when it comes back', () => {
    const paused = reconcilePrefs(both, [TAFSIR]);
    expect(paused.wanted).toContain('c-kabair-live');
    expect(reconcilePrefs(paused, [TAFSIR, TAWHID]).wanted).toEqual(both.wanted);
  });

  it('a new book inherits the kinds of the last course of its slot', () => {
    const p: Prefs = { wanted: ['c-kitab-tawhid-rec', 'c-kitab-tawhid-prep'], known: [['kitab-tawhid', 'fajr']] };
    const next = reconcilePrefs(p, [TAFSIR, book('tafsir-2', TAFSIR)]);
    expect(kindsOf(next, 'tafsir-2')).toEqual(['rec', 'prep']);
    expect(next.known.at(-1)).toEqual(['tafsir-2', 'fajr']);
  });

  it('a new book after a gap still inherits from the book that left', () => {
    const p: Prefs = { wanted: ['c-kitab-tawhid-live'], known: [['kitab-tawhid', 'fajr']] };
    const gap = reconcilePrefs(p, []);
    expect(kindsOf(reconcilePrefs(gap, [book('tafsir-2', TAFSIR)]), 'tafsir-2')).toEqual(['live']);
  });

  it('a switch turned off on the second book stays off on the third', () => {
    const p: Prefs = { wanted: topicsFor(['b1']).filter((t) => t !== 'live-other'), known: [['b1', 'fajr']] };
    const two = reconcilePrefs(p, [book('b2', TAFSIR)]);
    const off = { ...two, wanted: two.wanted.filter((t) => t !== 'c-b2-prep') };
    expect(kindsOf(reconcilePrefs(off, [book('b3', TAFSIR)]), 'b3')).toEqual(['live', 'rec']);
  });

  it('a course in a slot with no history starts with every notification on', () => {
    const p: Prefs = { wanted: [], known: [['kitab-tawhid', 'fajr']] };
    const next = reconcilePrefs(p, [TAFSIR, TAWHID]);
    expect(kindsOf(next, 'kabair')).toEqual(['live', 'rec', 'prep']);
    expect(kindsOf(next, 'kitab-tawhid')).toEqual([]);
    expect(next.known.map(([id]) => id)).toEqual(['kitab-tawhid', 'kabair']);
  });

  it('a new book in a slot whose lesson was left unticked stays silent', () => {
    const p: Prefs = { wanted: topicsFor(['kitab-tawhid']), known: [['kitab-tawhid', 'fajr'], ['kabair', 'asr']] };
    expect(kindsOf(reconcilePrefs(p, [TAFSIR, book('tawhid-2', TAWHID)]), 'tawhid-2')).toEqual([]);
  });
});

describe('migratePrefs', () => {
  const courses = FIXTURE_STATE.courses;

  it('keeps stored topics and the follow record decides nothing more', () => {
    const topics = [...topicsFor(['kitab-tawhid'])];
    const p = migratePrefs({ topics, topicCourses: ['kitab-tawhid'], follow: follow(['kitab-tawhid']) }, courses)!;
    expect(p.wanted.sort()).toEqual([...topics].sort());
    expect(p.known).toEqual([['kitab-tawhid', 'fajr'], ['kabair', 'asr']]);
  });

  it('takes the slot of a course that left from the follow record', () => {
    const f = { ...follow(['old']), known: { old: 'maghrib' as const } };
    const p = migratePrefs({ topics: ['c-old-live'], topicCourses: ['old'], follow: f }, courses)!;
    expect(p.known).toContainEqual(['old', 'maghrib']);
  });

  it('a follow record without stored topics gets its lessons and live-other', () => {
    const p = migratePrefs({ topics: null, topicCourses: null, follow: follow(['kitab-tawhid']) }, courses)!;
    expect(p.wanted.sort()).toEqual(topicsFor(['kitab-tawhid']).sort());
  });

  it('keeps the order courses were seen, so the next book inherits from the current one, not one that left', () => {
    const f: Follow = { ids: ['m2'], known: { 'kitab-tawhid': 'fajr', m1: 'maghrib', m2: 'maghrib' }, fresh: [], hint: false };
    const m2 = book('m2', TAWHID);
    const p = migratePrefs({ topics: topicsFor(['m2']), topicCourses: ['m2'], follow: f }, [TAFSIR, m2])!;
    expect(p.known.map(([id]) => id)).toEqual(['kitab-tawhid', 'm1', 'm2']);
    expect(kindsOf(reconcilePrefs(p, [TAFSIR, book('m3', TAWHID)]), 'm3')).toEqual(['live', 'rec', 'prep']);
  });

  it('a book that started before the update inherits from the one the old version knew', () => {
    const f: Follow = { ids: ['m1'], known: { 'kitab-tawhid': 'fajr', m1: 'maghrib' }, fresh: [], hint: false };
    const p = migratePrefs({ topics: [...topicsFor(['m1'])], topicCourses: ['m1'], follow: f }, [TAFSIR, book('m2', TAWHID)])!;
    expect(kindsOf(p, 'm2')).toEqual(['live', 'rec', 'prep']);
    expect(kindsOf(p, 'kitab-tawhid')).toEqual([]);
  });

  it('without a follow record (before the lesson choice), a course the old version had not seen gets all three, as it did then', () => {
    const p = migratePrefs({ topics: ['c-kabair-rec'], topicCourses: ['kabair'], follow: null }, courses)!;
    expect(p.known).toEqual([['kabair', 'asr'], ['kitab-tawhid', 'fajr']]);
    expect(kindsOf(p, 'kabair')).toEqual(['rec']);
    expect(kindsOf(p, 'kitab-tawhid')).toEqual(['live', 'rec', 'prep']);
    expect(p.wanted).not.toContain('live-other');
    expect(migratePrefs({ topics: ['live-other'], topicCourses: null, follow: null }, courses)!.wanted.sort()).toEqual(topicsFor(courses.map((c) => c.id)).sort());
  });

  it('a followed course that was paused at the update gets its three switches back, as the old version would have', () => {
    const f: Follow = { ids: ['kitab-tawhid', 'm1'], known: { 'kitab-tawhid': 'fajr', m1: 'maghrib' }, fresh: [], hint: false };
    const p = migratePrefs({ topics: [`c-kitab-tawhid-rec`], topicCourses: ['kitab-tawhid'], follow: f }, [TAFSIR])!;
    expect(kindsOf(p, 'm1')).toEqual(['live', 'rec', 'prep']);
    expect(kindsOf(p, 'kitab-tawhid')).toEqual(['rec']);
  });

  it('nothing stored is a new listener', () => {
    expect(migratePrefs({ topics: null, topicCourses: null, follow: null }, courses)).toBeNull();
  });
});

describe('subscriptionPlan', () => {
  it('subscribes only listed courses and drops what is not wanted', () => {
    const p: Prefs = { wanted: ['c-kitab-tawhid-live', 'c-kabair-rec', 'live-other'], known: [['kitab-tawhid', 'fajr'], ['kabair', 'asr']] };
    const plan = subscriptionPlan(p, ['kitab-tawhid'], ['c-kabair-rec', 'c-kitab-tawhid-prep']);
    expect(plan.wanted.sort()).toEqual(['c-kitab-tawhid-live', 'live-other']);
    expect(plan.sub.sort()).toEqual(['c-kitab-tawhid-live', 'live-other']);
    expect(plan.unsub.sort()).toEqual(['c-kabair-rec', 'c-kitab-tawhid-prep', 'c-kitab-tawhid-rec']);
  });
});

describe('attended', () => {
  const known: Prefs['known'] = [['kitab-tawhid', 'fajr'], ['kabair', 'asr']];

  it('is the lessons with at least one switch on', () => {
    expect(attended({ wanted: ['c-kitab-tawhid-prep', 'live-other'], known }, FIXTURE_STATE.courses)).toEqual(['kitab-tawhid']);
  });

  it('is every lesson when none has a switch on', () => {
    expect(attended({ wanted: ['live-other'], known }, FIXTURE_STATE.courses)).toEqual(['kitab-tawhid', 'kabair']);
    expect(attended(null, FIXTURE_STATE.courses)).toEqual(['kitab-tawhid', 'kabair']);
  });
});
