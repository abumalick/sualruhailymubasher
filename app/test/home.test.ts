import { beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import type { CourseDTO, StateDTO } from '@albadr/shared';

const store = new Map<string, string>();
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => void store.set(key, value),
    remove: async ({ key }: { key: string }) => void store.delete(key),
    keys: async () => ({ keys: [...store.keys()] }),
  },
}));

import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { buildHome } from '../src/logic/home';
import { loadTicks, setTick, type Ticks } from '../src/logic/ticks';
import { hijriLabel, hijriToday, lessonInstant, medinaDate } from '../src/logic/time';

const none: Ticks = { read: new Set(), reviewed: new Set() };
const tafsirOnly = (): StateDTO => ({ ...FIXTURE_STATE, courses: [FIXTURE_STATE.courses[0]] });
const withCourse = (id: string, patch: Partial<CourseDTO>): StateDTO => ({
  ...FIXTURE_STATE,
  courses: FIXTURE_STATE.courses.map((c) => (c.id === id ? { ...c, ...patch } : c)),
});
const live = (courseId: string | null): StateDTO => ({
  ...FIXTURE_STATE,
  live: { ...FIXTURE_STATE.live, isLive: true, courseId, startedAt: '2026-11-02T02:25:00Z' },
});

const MON_2110 = new Date('2026-11-02T18:10:00Z');
const MON_0940 = new Date('2026-11-02T06:40:00Z');
const MON_1531 = new Date('2026-11-02T12:31:00Z');

beforeEach(() => store.clear());

describe('time helpers', () => {
  it('maps the fixture date to the Medina hijri date', () => {
    expect(medinaDate(new Date('2026-11-02T21:30:00Z'))).toBe('2026-11-03');
    expect(hijriToday(MON_0940)).toBe('22-05-1448');
    expect(lessonInstant('2026-11-03', '05:25').toISOString()).toBe('2026-11-03T02:25:00.000Z');
    expect(hijriLabel(MON_0940)).toMatch(/الاثنين/);
  });
});

describe('buildHome', () => {
  it('Mon 21:10 -> prepare tafsir hero, review 443 card', () => {
    const h = buildHome(FIXTURE_STATE, none, MON_2110);
    expect(h.hero).toMatchObject({ kind: 'prepare', courseId: 'tafsir-saadi', done: false });
    expect(h.cards).toContainEqual(expect.objectContaining({ kind: 'review', courseId: 'tafsir-saadi' }));
    expect(h.cards).toContainEqual({ kind: 'awaiting-recording', courseId: 'kitab-tawhid', lessonNumber: 3 });
    expect(h.steps).toEqual({ prepare: 'current', lesson: 'todo', review: 'todo' });
  });

  it('Mon 09:40 -> review 443 hero, prepare 444 card', () => {
    const h = buildHome(FIXTURE_STATE, none, MON_0940);
    expect(h.hero).toMatchObject({ kind: 'review', courseId: 'tafsir-saadi' });
    expect((h.hero as { lesson: { number: number } }).lesson.number).toBe(443);
    expect(h.cards).toContainEqual(expect.objectContaining({ kind: 'prepare', next: expect.objectContaining({ number: 444 }) }));
    expect(h.steps).toEqual({ prepare: 'done', lesson: 'done', review: 'current' });
  });

  it('live with a course: hero live, ticks ignored, course items become cards', () => {
    const ticks: Ticks = { read: new Set(['tafsir-saadi:443']), reviewed: new Set(['tafsir-saadi:443']) };
    const h = buildHome(live('tafsir-saadi'), ticks, MON_0940);
    expect(h.hero).toEqual({ kind: 'live', courseId: 'tafsir-saadi', lessonNumber: 444 });
    expect(h.cards.some((i) => i.kind === 'review' && i.courseId === 'tafsir-saadi')).toBe(true);
    expect(h.cards.some((i) => i.kind === 'prepare' && i.courseId === 'tafsir-saadi')).toBe(false);
    expect(h.steps?.lesson).toBe('current');
  });

  it('live without a course: hero live with null course, all items as cards', () => {
    const h = buildHome(live(null), none, MON_0940);
    expect(h.hero).toEqual({ kind: 'live', courseId: null, lessonNumber: null });
    expect(h.cards.filter((i) => i.kind === 'review')).toHaveLength(2);
    expect(h.cards.filter((i) => i.kind === 'prepare')).toHaveLength(2);
    expect(h.steps).toBeNull();
  });

  it('reviewed tick at 09:40 -> next not-done review hero, done review kept as card', () => {
    const ticks: Ticks = { read: new Set(), reviewed: new Set(['tafsir-saadi:443']) };
    const h = buildHome(FIXTURE_STATE, ticks, MON_0940);
    expect(h.hero).toMatchObject({ kind: 'review', courseId: 'kitab-tawhid' });
    expect(h.cards).toContainEqual(expect.objectContaining({ kind: 'review', courseId: 'tafsir-saadi', done: true }));
    expect(h.steps).toEqual({ prepare: 'done', lesson: 'done', review: 'current' });
  });

  it('all reviews done at 09:40 -> prepare of the soonest course', () => {
    const ticks: Ticks = { read: new Set(), reviewed: new Set(['tafsir-saadi:443', 'kitab-tawhid:2']) };
    const h = buildHome(FIXTURE_STATE, ticks, MON_0940);
    expect(h.hero).toMatchObject({ kind: 'prepare', courseId: 'kitab-tawhid' });
  });

  it('a moved lesson is held on dateTo at the given time, not on dateFrom', () => {
    const move = { id: 2, courseId: 'tafsir-saadi', kind: 'move' as const, dateFrom: '2026-11-02', dateTo: '2026-11-03', time: '07:00', note: '' };
    const state = withCourse('tafsir-saadi', { exceptions: [move] });
    expect(buildHome(state, none, MON_0940).today.map((t) => t.courseId)).toEqual(['kitab-tawhid']);
    const tue = buildHome(state, none, new Date('2026-11-03T02:00:00Z'));
    expect(tue.today).toContainEqual({ courseId: 'tafsir-saadi', time: '07:00', status: 'upcoming' });
  });

  it('course with no lessons and no next yields no items', () => {
    const state = withCourse('tafsir-saadi', { latest: [], next: null });
    const h = buildHome({ ...state, courses: [state.courses[0]] }, none, MON_0940);
    expect(h).toEqual({ hero: null, cards: [], steps: null, today: expect.any(Array) });
  });

  it('Fajr review stays a card at Mon 15:31 when Maghrib becomes focus', () => {
    const h = buildHome(FIXTURE_STATE, none, MON_1531);
    expect(h.hero).toMatchObject({ kind: 'prepare', courseId: 'kitab-tawhid' });
    expect(h.cards).toContainEqual(expect.objectContaining({ kind: 'review', courseId: 'tafsir-saadi' }));
  });

  it('Maghrib prepare is not emphasised before 15:30', () => {
    const h = buildHome(FIXTURE_STATE, none, new Date('2026-11-02T12:29:00Z'));
    expect(h.hero).toMatchObject({ kind: 'review', courseId: 'tafsir-saadi' });
  });

  it('awaiting recording when today is dated and has no recording', () => {
    const base = FIXTURE_STATE.courses[0];
    const state = withCourse('tafsir-saadi', { latest: [{ ...base.latest[0], recordingUrl: null }, ...base.latest.slice(1)] });
    const h = buildHome(state, none, MON_0940);
    expect(h.cards).toContainEqual({ kind: 'awaiting-recording', courseId: 'tafsir-saadi', lessonNumber: 443 });
  });

  it('awaiting recording 30 min after a held lesson not yet listed, number = latest + 1', () => {
    const state = tafsirOnly();
    const prepared = buildHome(state, none, new Date('2026-11-03T02:56:00Z'));
    expect(prepared.cards.concat(prepared.hero ? [prepared.hero] : [])).toContainEqual(
      expect.objectContaining({ kind: 'awaiting-recording', lessonNumber: 444 }),
    );
    const early = buildHome(state, none, new Date('2026-11-03T02:54:00Z'));
    expect([early.hero, ...early.cards]).not.toContainEqual(expect.objectContaining({ kind: 'awaiting-recording' }));
  });

  it('a cancelled lesson today is not awaited', () => {
    const state = withCourse('kitab-tawhid', {
      exceptions: [{ id: 1, courseId: null, kind: 'cancel', dateFrom: '2026-11-02', dateTo: null, time: null, note: '' }],
    });
    const h = buildHome(state, none, MON_2110);
    expect([h.hero, ...h.cards]).not.toContainEqual(expect.objectContaining({ kind: 'awaiting-recording' }));
  });

  it('today list reports status per held course', () => {
    const h = buildHome(FIXTURE_STATE, none, MON_0940);
    expect(h.today).toEqual([
      { courseId: 'tafsir-saadi', time: '05:25', status: 'done' },
      { courseId: 'kitab-tawhid', time: '18:20', status: 'upcoming' },
    ]);
  });
});

describe('ticks', () => {
  it('round-trips through preferences', async () => {
    await setTick('read', 'tafsir-saadi', 444, true);
    await setTick('reviewed', 'kitab-tawhid', 2, true);
    expect(await loadTicks()).toEqual({ read: new Set(['tafsir-saadi:444']), reviewed: new Set(['kitab-tawhid:2']) });
    await setTick('read', 'tafsir-saadi', 444, false);
    expect((await loadTicks()).read.size).toBe(0);
  });
});
