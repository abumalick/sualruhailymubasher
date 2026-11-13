import { describe, expect, it } from 'vitest';
import type { LiveDTO } from '@albadr/shared';
import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { buildLesson, LESSON_MS, nextStart } from '../src/logic/lesson';
import type { Ticks } from '../src/logic/ticks';
import { liveDTO } from './live-state';

const [tafsir, tawhid] = FIXTURE_STATE.courses;
const quiet: LiveDTO = FIXTURE_STATE.live;
const none: Ticks = { read: new Set(), reviewed: new Set() };

const MON_0940 = new Date('2026-11-02T06:40:00Z');
const MON_1900 = new Date('2026-11-02T16:00:00Z');
const MON_2040 = new Date('2026-11-02T17:40:00Z');
const MON_2110 = new Date('2026-11-02T18:10:00Z');

describe('nextStart and LESSON_MS', () => {
  it('give the next lesson instant and 150 minutes', () => {
    expect(new Date(nextStart(tawhid)).toISOString()).toBe('2026-11-02T15:20:00.000Z');
    expect(nextStart({ ...tawhid, next: null })).toBe(Infinity);
    expect(LESSON_MS).toBe(150 * 60_000);
  });
});

describe('buildLesson', () => {
  it('tafsir at MON_2110: next 444, last recording 443, archive skips 443', () => {
    const m = buildLesson(tafsir, quiet, none, MON_2110);
    expect(m.top).toMatchObject({ kind: 'next', read: false, next: { number: 444 } });
    expect(m.last).toMatchObject({ kind: 'recording', reviewed: false, lesson: { number: 443 } });
    expect(m.archiveSkip).toBe(443);
  });

  it('tawhid at MON_1900 (18:20 start passed, no broadcast): today 3, last recording 2', () => {
    const m = buildLesson(tawhid, quiet, none, MON_1900);
    expect(m.top).toMatchObject({ kind: 'today', ended: false, next: { number: 3 } });
    expect(m.last).toMatchObject({ kind: 'recording', lesson: { number: 2 } });
    expect(m.archiveSkip).toBe(2);
  });

  it('tawhid at MON_2110 (150 min passed, nothing recorded): ended, awaiting 3, the archive keeps 2', () => {
    const m = buildLesson(tawhid, quiet, none, MON_2110);
    expect(m.top).toMatchObject({ kind: 'today', ended: true, next: { number: 3 } });
    expect(m.last).toEqual({ kind: 'awaiting', lessonNumber: 3 });
    expect(m.archiveSkip).toBeNull();
  });

  it('tawhid at MON_2040 (under 150 min): still the previous recording', () => {
    expect(buildLesson(tawhid, quiet, none, MON_2040).last).toMatchObject({ kind: 'recording', lesson: { number: 2 } });
  });

  it('tawhid on air: the live top with its lesson number, last recording 2', () => {
    const m = buildLesson(tawhid, liveDTO('kitab-tawhid'), none, MON_2110);
    expect(m.top).toEqual({ kind: 'live', lessonNumber: 3 });
    expect(m.last).toMatchObject({ kind: 'recording', lesson: { number: 2 } });
  });

  it('another course on air leaves this one quiet', () => {
    expect(buildLesson(tafsir, liveDTO('kitab-tawhid'), none, MON_2110).top.kind).toBe('next');
  });

  it('broadcast counted before it was published (next 4, latest 2): awaiting 3, next 4', () => {
    const counted = { ...tawhid, next: { ...tawhid.next!, date: '2026-11-03', number: 4 } };
    const m = buildLesson(counted, quiet, none, MON_2110);
    expect(m.top).toMatchObject({ kind: 'next', next: { number: 4 } });
    expect(m.last).toEqual({ kind: 'awaiting', lessonNumber: 3 });
    expect(m.archiveSkip).toBeNull();
  });

  it('recorded today without a recording url: awaiting that lesson, skipped from the archive', () => {
    const latest = [{ ...tafsir.latest[0], recordingUrl: null }, ...tafsir.latest.slice(1)];
    const m = buildLesson({ ...tafsir, latest }, quiet, none, MON_0940);
    expect(m.last).toEqual({ kind: 'awaiting', lessonNumber: 443 });
    expect(m.archiveSkip).toBe(443);
  });

  it('a published lesson whose next has not moved yet stays the recording', () => {
    const published = { ...tawhid, latest: [{ ...tawhid.latest[0], number: 3, hijriDate: '22-05-1448' }, ...tawhid.latest] };
    const m = buildLesson(published, quiet, none, MON_2110);
    expect(m.last).toMatchObject({ kind: 'recording', lesson: { number: 3 } });
    expect(m.archiveSkip).toBe(3);
  });

  it('read and reviewed ticks flow into top.read and last.reviewed', () => {
    const ticks: Ticks = { read: new Set(['tafsir-saadi:444']), reviewed: new Set(['tafsir-saadi:443']) };
    const m = buildLesson(tafsir, quiet, ticks, MON_2110);
    expect(m.top).toMatchObject({ kind: 'next', read: true });
    expect(m.last).toMatchObject({ kind: 'recording', reviewed: true });
  });

  it('no next: top none', () => {
    expect(buildLesson({ ...tafsir, next: null }, quiet, none, MON_2110).top).toEqual({ kind: 'none' });
  });

  it('no lessons: last null', () => {
    const m = buildLesson({ ...tafsir, latest: [] }, quiet, none, MON_2110);
    expect(m.last).toBeNull();
    expect(m.archiveSkip).toBeNull();
  });
});
