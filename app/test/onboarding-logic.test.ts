import { describe, expect, it } from 'vitest';
import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { asksPermission, cardFor, finalPrefs, initialDraft, pick, pickedCourses, stepTopics } from '../src/logic/onboarding';
import type { Prefs } from '../src/logic/prefs';
import { topicsFor } from '../src/logic/topics';
import { liveDTO } from './live-state';

const courses = FIXTURE_STATE.courses;
const [tafsir, tawhid] = courses;
const known: Prefs['known'] = [['tafsir-saadi', 'fajr'], ['kitab-tawhid', 'maghrib']];
const quiet = FIXTURE_STATE.live;

describe('initialDraft', () => {
  it('a new listener starts with every lesson ticked and every switch on', () => {
    const d = initialDraft(null, courses);
    expect(d.picked).toEqual(['tafsir-saadi', 'kitab-tawhid']);
    expect(d.wanted.sort()).toEqual(topicsFor(['tafsir-saadi', 'kitab-tawhid']).sort());
  });

  it('a listener with stored choices starts from them', () => {
    const d = initialDraft({ wanted: ['c-tafsir-saadi-rec'], known }, courses);
    expect(d).toEqual({ picked: ['tafsir-saadi'], wanted: ['c-tafsir-saadi-rec'] });
  });
});

describe('pick', () => {
  it('ticking a lesson whose switches are all off turns its three on', () => {
    const d = pick({ picked: ['tafsir-saadi'], wanted: [] }, 'kitab-tawhid', true);
    expect(d.picked).toEqual(['tafsir-saadi', 'kitab-tawhid']);
    expect(d.wanted).toEqual(['c-kitab-tawhid-live', 'c-kitab-tawhid-rec', 'c-kitab-tawhid-prep']);
  });

  it('ticking a lesson that kept a switch keeps its switches as they were', () => {
    const d = pick({ picked: [], wanted: ['c-kitab-tawhid-rec'] }, 'kitab-tawhid', true);
    expect(d.wanted).toEqual(['c-kitab-tawhid-rec']);
  });

  it('unticking keeps the switches, so ticking again restores them', () => {
    const d = pick({ picked: ['kitab-tawhid'], wanted: ['c-kitab-tawhid-rec'] }, 'kitab-tawhid', false);
    expect(d).toEqual({ picked: [], wanted: ['c-kitab-tawhid-rec'] });
  });
});

describe('pickedCourses', () => {
  it('lists the ticked lessons Fajr first', () => {
    expect(pickedCourses({ picked: ['kitab-tawhid', 'tafsir-saadi'], wanted: [] }, [tawhid, tafsir]).map((c) => c.id)).toEqual(['tafsir-saadi', 'kitab-tawhid']);
  });
});

describe('stepTopics', () => {
  it('the live step has one switch per lesson and one for other broadcasts', () => {
    expect(stepTopics('live', [tafsir, tawhid])).toEqual([
      { topic: 'c-tafsir-saadi-live', courseId: 'tafsir-saadi' },
      { topic: 'c-kitab-tawhid-live', courseId: 'kitab-tawhid' },
      { topic: 'live-other', courseId: null },
    ]);
  });

  it('revision and preparation have one switch per lesson; the first screen none', () => {
    expect(stepTopics('rec', [tawhid])).toEqual([{ topic: 'c-kitab-tawhid-rec', courseId: 'kitab-tawhid' }]);
    expect(stepTopics('prep', [tafsir])).toEqual([{ topic: 'c-tafsir-saadi-prep', courseId: 'tafsir-saadi' }]);
    expect(stepTopics('app', [tafsir])).toEqual([]);
  });
});

describe('cardFor', () => {
  it('live: the broadcast on air when it is a picked lesson', () => {
    expect(cardFor('live', [tafsir, tawhid], liveDTO('kitab-tawhid'))).toEqual({ course: tawhid, kind: 'live' });
  });

  it('live: otherwise a preview of the first picked lesson with its next number', () => {
    expect(cardFor('live', [tafsir, tawhid], quiet)).toEqual({ course: tafsir, kind: 'preview', number: 444 });
    expect(cardFor('live', [tafsir], liveDTO('kitab-tawhid'))).toEqual({ course: tafsir, kind: 'preview', number: 444 });
  });

  it('live: a lesson with nothing scheduled previews the lesson after its last one', () => {
    expect(cardFor('live', [{ ...tafsir, next: null }], quiet)).toEqual({ course: { ...tafsir, next: null }, kind: 'preview', number: 444 });
  });

  it('revision: the first picked lesson with a recording', () => {
    const noRec = { ...tafsir, latest: tafsir.latest.map((l) => ({ ...l, recordingUrl: null })) };
    expect(cardFor('rec', [tafsir, tawhid], quiet)).toEqual({ course: tafsir, kind: 'recording', lesson: tafsir.latest[0] });
    expect(cardFor('rec', [noRec, tawhid], quiet)).toEqual({ course: tawhid, kind: 'recording', lesson: tawhid.latest[0] });
    expect(cardFor('rec', [noRec], quiet)).toBeNull();
  });

  it('preparation: the first picked lesson with a next lesson', () => {
    expect(cardFor('prep', [tafsir], quiet)).toEqual({ course: tafsir, kind: 'next', next: tafsir.next });
    expect(cardFor('prep', [{ ...tafsir, next: null }], quiet)).toBeNull();
  });

  it('nothing picked or listed gives no card', () => {
    expect(cardFor('live', [], quiet)).toBeNull();
  });
});

describe('asksPermission', () => {
  const all = { picked: ['tafsir-saadi', 'kitab-tawhid'], wanted: topicsFor(['tafsir-saadi', 'kitab-tawhid']) };
  const noLive = { ...all, wanted: all.wanted.filter((t) => !t.endsWith('live') && t !== 'live-other') };

  it('asks on the live step when one of its switches is on', () => {
    expect(asksPermission('live', all, courses, false, 'prompt')).toBe(true);
    expect(asksPermission('live', all, courses, false, 'prompt-with-rationale')).toBe(true);
  });

  it('moves to the next step whose switches include one that is on', () => {
    expect(asksPermission('live', noLive, courses, false, 'prompt')).toBe(false);
    expect(asksPermission('rec', noLive, courses, false, 'prompt')).toBe(true);
  });

  it('never asks twice, after a decision, or on the first screen', () => {
    expect(asksPermission('rec', all, courses, true, 'prompt')).toBe(false);
    expect(asksPermission('live', all, courses, false, 'denied')).toBe(false);
    expect(asksPermission('live', all, courses, false, 'granted')).toBe(false);
    expect(asksPermission('app', all, courses, false, 'prompt')).toBe(false);
  });
});

describe('finalPrefs', () => {
  it('an unticked lesson loses its switches; other broadcasts stay as chosen', () => {
    const d = { picked: ['tafsir-saadi'], wanted: topicsFor(['tafsir-saadi', 'kitab-tawhid']) };
    const p = finalPrefs(d, courses, null);
    expect(p.wanted.sort()).toEqual(topicsFor(['tafsir-saadi']).sort());
    expect(p.known).toEqual(known);
  });

  it('keeps the known courses that left the list and the switches they had', () => {
    const prev: Prefs = { wanted: ['c-old-live'], known: [['old', 'fajr'], ...known] };
    const p = finalPrefs({ picked: ['tafsir-saadi'], wanted: ['c-old-live', 'c-tafsir-saadi-rec'] }, courses, prev);
    expect(p).toEqual({ wanted: ['c-old-live', 'c-tafsir-saadi-rec'], known: prev.known });
  });
});
