import { describe, expect, it } from 'vitest';
import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { asksPermission, cardFor, finalPrefs, initialDraft, pick, pickedCourses, hasSwitch, setStep, stepHint, stepOn, stepTopics } from '../src/logic/onboarding';
import { kindsOf, reconcilePrefs, type Prefs } from '../src/logic/prefs';
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
  it('the live switch covers every ticked lesson and other broadcasts', () => {
    expect(stepTopics('live', [tafsir, tawhid])).toEqual([
      { topic: 'c-tafsir-saadi-live', courseId: 'tafsir-saadi' },
      { topic: 'c-kitab-tawhid-live', courseId: 'kitab-tawhid' },
      { topic: 'live-other', courseId: null },
    ]);
  });

  it('the revision and preparation switches cover every ticked lesson; the first screen has none', () => {
    expect(stepTopics('rec', [tawhid])).toEqual([{ topic: 'c-kitab-tawhid-rec', courseId: 'kitab-tawhid' }]);
    expect(stepTopics('prep', [tafsir])).toEqual([{ topic: 'c-tafsir-saadi-prep', courseId: 'tafsir-saadi' }]);
    expect(stepTopics('app', [tafsir])).toEqual([]);
  });
});

describe('one switch per step', () => {
  const all = { picked: ['tafsir-saadi', 'kitab-tawhid'], wanted: topicsFor(['tafsir-saadi', 'kitab-tawhid']) };

  it('turned off, it silences that notification for every ticked lesson and leaves the other steps alone', () => {
    const d = setStep(all, 'rec', [tafsir, tawhid], false);
    expect(d.wanted.sort()).toEqual(all.wanted.filter((t) => !t.endsWith('-rec')).sort());
    expect(stepOn('rec', d, [tafsir, tawhid])).toBe(false);
    expect(stepOn('prep', d, [tafsir, tawhid])).toBe(true);
  });

  it('turned on, it turns that notification on for every ticked lesson, and only for them', () => {
    const d = setStep({ picked: ['tafsir-saadi'], wanted: [] }, 'prep', [tafsir], true);
    expect(d.wanted).toEqual(['c-tafsir-saadi-prep']);
  });

  it('other broadcasts follow the live switch, even with only Fajr ticked', () => {
    const fajrOnly = { picked: ['tafsir-saadi'], wanted: ['c-tafsir-saadi-live', 'live-other'] };
    const off = setStep(fajrOnly, 'live', [tafsir], false);
    expect(off.wanted).toEqual([]);
    expect(setStep(off, 'live', [tafsir], true).wanted.sort()).toEqual(['c-tafsir-saadi-live', 'live-other']);
  });

  it('with no lesson listed, the live switch still controls other broadcasts', () => {
    const d = setStep({ picked: [], wanted: ['live-other'] }, 'live', [], false);
    expect(d.wanted).toEqual([]);
    expect(stepOn('live', d, [])).toBe(false);
  });

  it('reads on when any ticked lesson has it on; untouched, a mixed record stays as it was', () => {
    const mixed = { picked: ['tafsir-saadi', 'kitab-tawhid'], wanted: ['c-tafsir-saadi-live'] };
    expect(stepOn('live', mixed, [tafsir, tawhid])).toBe(true);
    expect(finalPrefs(mixed, courses, null).wanted).toEqual(['c-tafsir-saadi-live']);
    expect(setStep(mixed, 'live', [tafsir, tawhid], true).wanted.sort()).toEqual(['c-kitab-tawhid-live', 'c-tafsir-saadi-live', 'live-other']);
  });

  it('the live switch reads the ticked lessons, not other broadcasts kept on in Notifications', () => {
    const otherOnly = { picked: ['tafsir-saadi', 'kitab-tawhid'], wanted: ['live-other'] };
    expect(stepOn('live', otherOnly, [tafsir, tawhid])).toBe(false);
    expect(asksPermission('live', otherOnly, [tafsir, tawhid], false, 'prompt')).toBe(false);
    expect(setStep(otherOnly, 'live', [tafsir, tawhid], true).wanted.sort()).toEqual(['c-kitab-tawhid-live', 'c-tafsir-saadi-live', 'live-other']);
  });

  it('only the live step has a switch when no lesson is listed: it is the one for other broadcasts', () => {
    expect(hasSwitch('live', [])).toBe(true);
    expect(stepOn('live', { picked: [], wanted: ['live-other'] }, [])).toBe(true);
    expect(hasSwitch('rec', [])).toBe(false);
    expect(hasSwitch('prep', [])).toBe(false);
    expect(hasSwitch('rec', [tafsir])).toBe(true);
    expect(hasSwitch('app', [tafsir])).toBe(false);
  });

  it('an unticked lesson keeps its switch, so ticking it again turns the step back on', () => {
    const off = setStep({ picked: ['tafsir-saadi'], wanted: ['c-kitab-tawhid-rec', 'c-tafsir-saadi-rec'] }, 'rec', [tafsir], false);
    expect(off.wanted).toEqual(['c-kitab-tawhid-rec']);
    const back = pick(off, 'kitab-tawhid', true);
    expect(stepOn('rec', back, [tafsir, tawhid])).toBe(true);
  });
});

describe('stepHint', () => {
  const book2 = { ...tafsir, id: 'usul-thalatha', title: 'شرح الأصول الثلاثة' };

  it('names the ticked lessons the live and revision switches cover', () => {
    expect(stepHint('live', [tafsir, tawhid], courses)).toBe('درس الفجر ودرس المغرب');
    expect(stepHint('rec', [tawhid], courses)).toBe('درس المغرب');
  });

  it('preparation: the reminder time alone for one lesson, one line per lesson for several', () => {
    expect(stepHint('prep', [tafsir], courses)).toBe('مساء اليوم السابق · ٩:٠٠ م');
    expect(stepHint('prep', [tafsir, tawhid], courses)).toBe('الفجر: مساء اليوم السابق · ٩:٠٠ م\nالمغرب: عصر يوم الدرس · ٣:٣٠ م');
  });

  it('preparation: two books in one slot are told apart by title', () => {
    const all = [tafsir, book2, tawhid];
    expect(stepHint('prep', [tafsir, book2], all)).toBe(`${tafsir.title}: مساء اليوم السابق · ٩:٠٠ م\n${book2.title}: مساء اليوم السابق · ٩:٠٠ م`);
  });

  it('nothing ticked or listed: no hint', () => {
    expect(stepHint('live', [], [])).toBe('');
    expect(stepHint('app', [tafsir], courses)).toBe('');
  });
});

describe('cardFor', () => {
  it('live: the broadcast on air when it is a picked lesson', () => {
    expect(cardFor('live', [tafsir, tawhid], liveDTO('kitab-tawhid'))).toEqual({ course: tawhid, kind: 'live' });
  });

  it('live: otherwise the first picked lesson, shown as it will be on air', () => {
    expect(cardFor('live', [tafsir, tawhid], quiet)).toEqual({ course: tafsir, kind: 'live' });
    expect(cardFor('live', [tafsir], liveDTO('kitab-tawhid'))).toEqual({ course: tafsir, kind: 'live' });
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

  it('finished while no lesson is listed, the first lessons to appear get every notification', () => {
    const p = finalPrefs(initialDraft(null, []), [], null);
    const next = reconcilePrefs(p, courses);
    expect(kindsOf(next, 'tafsir-saadi')).toEqual(['live', 'rec', 'prep']);
    expect(kindsOf(next, 'kitab-tawhid')).toEqual(['live', 'rec', 'prep']);
  });
});
