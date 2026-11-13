import { describe, expect, it } from 'vitest';
import type { CourseDTO } from '@albadr/shared';
import { backAction, bookBack, CLOSED, listeningLive, liveContext, liveLesson, nextLivePlayer, type LiveEvent, type LivePlayer } from '../src/logic/live';
import { endedState, liveDTO, STARTED, TAFSIR, TAWHID, TAWHID_14 } from './live-state';

const open = (courseId: string): LivePlayer => ({ view: 'expanded', courseId, startedAt: STARTED[courseId] });
const ev = (type: 'expand' | 'collapse' | 'navigate' | 'close' | 'play-recording'): LiveEvent => ({ type });

describe('nextLivePlayer', () => {
  it('opening takes the broadcast course and start', () => {
    expect(nextLivePlayer(CLOSED, { type: 'open', live: liveDTO('kitab-tawhid') })).toEqual(open('kitab-tawhid'));
  });

  const views: [LivePlayer['view'], LiveEvent, LivePlayer['view']][] = [
    ['expanded', ev('collapse'), 'collapsed'],
    ['collapsed', ev('expand'), 'expanded'],
    ['expanded', ev('navigate'), 'collapsed'],
    ['collapsed', ev('navigate'), 'collapsed'],
    ['expanded', ev('close'), 'closed'],
    ['collapsed', ev('close'), 'closed'],
    ['collapsed', ev('play-recording'), 'closed'],
    ['expanded', ev('play-recording'), 'closed'],
  ];
  it.each(views)('%s + %o -> %s', (view, e, expected) => {
    expect(nextLivePlayer({ ...open('kitab-tawhid'), view }, e).view).toBe(expected);
  });

  it('closing forgets the broadcast', () => {
    expect(nextLivePlayer(open('kitab-tawhid'), ev('close'))).toEqual(CLOSED);
  });

  it('a closed player stays closed whatever happens', () => {
    for (const e of [ev('expand'), ev('collapse'), ev('navigate'), ev('close'), ev('play-recording'), { type: 'state', live: liveDTO('tafsir-saadi') } as LiveEvent]) {
      expect(nextLivePlayer(CLOSED, e)).toEqual(CLOSED);
    }
  });

  it('keeps the course and start once the server reports the end with no course', () => {
    const p = { ...open('kitab-tawhid'), view: 'collapsed' as const };
    expect(nextLivePlayer(p, { type: 'state', live: endedState().live })).toBe(p);
  });

  it('follows a new broadcast while open', () => {
    expect(nextLivePlayer(open('kitab-tawhid'), { type: 'state', live: liveDTO('tafsir-saadi') })).toEqual(open('tafsir-saadi'));
  });
});

describe('liveLesson', () => {
  const flipped: CourseDTO = {
    ...TAWHID,
    next: { ...TAWHID.next!, date: '2026-11-03', number: 16, startPoint: null, startPage: 285, estEndPage: 290, estimated: true },
  };

  it('the next lesson is the one on air when it is dated the broadcast day', () => {
    expect(liveLesson(TAWHID, STARTED['kitab-tawhid'])).toEqual({
      number: 15,
      start: { startPoint: TAWHID_14.endPoint, pdfIndex: 0, startPage: 280 },
    });
  });

  it('a long broadcast keeps its lesson after next has moved on: starts where the previous lesson ended', () => {
    expect(liveLesson(flipped, STARTED['kitab-tawhid'])).toEqual({
      number: 15,
      start: { startPoint: 'من قوله: <فيه مسائل: الأولى: الخوف من الشرك>…', pdfIndex: 0, startPage: 280 },
    });
  });

  it('after next has moved on, a published lesson on air gives its own start', () => {
    const published = { ...flipped, latest: [{ ...TAWHID_14, number: 15, startPoint: 'بداية الدرس ١٥', startPage: 281 }, ...flipped.latest] };
    expect(liveLesson(published, STARTED['kitab-tawhid']).start).toEqual({ startPoint: 'بداية الدرس ١٥', pdfIndex: 0, startPage: 281 });
  });

  it('after next has moved on with no known previous end, the start is unknown', () => {
    expect(liveLesson({ ...flipped, latest: [] }, STARTED['kitab-tawhid'])).toEqual({ number: 15, start: null });
  });

  it('a lesson published while still on air stays the lesson, although next already counts past it', () => {
    const fifteen = { ...TAWHID_14, number: 15, hijriDate: '22-05-1448', startPoint: TAWHID_14.endPoint!, startPage: 280, endPoint: null, endPage: null };
    const published: CourseDTO = {
      ...TAWHID,
      latest: [fifteen, ...TAWHID.latest],
      next: { ...TAWHID.next!, date: '2026-11-02', number: 16, startPoint: null, startPage: 285, estimated: true },
    };
    expect(liveLesson(published, STARTED['kitab-tawhid'])).toEqual({
      number: 15,
      start: { startPoint: 'من قوله: <فيه مسائل: الأولى: الخوف من الشرك>…', pdfIndex: 0, startPage: 280 },
    });
  });

  it('a broadcast that runs past Medina midnight keeps next when next is dated the day before', () => {
    expect(liveLesson(TAWHID, '2026-11-02T21:30:00Z').number).toBe(15);
  });

  it('without a broadcast start or next lesson it falls back', () => {
    expect(liveLesson(TAWHID, null).number).toBe(15);
    expect(liveLesson(TAWHID, 'not a date').number).toBe(15);
    expect(liveLesson({ ...TAFSIR, next: null }, STARTED['tafsir-saadi'])).toEqual({ number: 444, start: null });
  });
});

describe('liveContext', () => {
  it('Tafsir: start text as served, printed page with edition, no book link', () => {
    expect(liveContext(TAFSIR, true, STARTED['tafsir-saadi'])).toEqual({
      title: 'شرح تفسير السعدي',
      header: 'البث المباشر · الدرس ٤٦٠',
      start: 'تفسير سورة التوبة: من الآية (٨) ﴿كَيْفَ وَإِنْ يَظْهَرُوا عَلَيْكُمْ لَا يَرْقُبُوا فِيكُمْ إِلًّا وَلَا ذِمَّةً...﴾',
      edition: 'ص ٦٣٦ · طبعة دار ابن الجوزي',
      book: null,
      bookLabel: 'تابع في الكتاب · ص ٦٣٦',
      status: { live: true, text: 'مباشر · الدرس ٤٦٠ · ص ٦٣٦ · طبعة دار ابن الجوزي' },
    });
  });

  it('evening course: book link at the start page with the marker', () => {
    const ctx = liveContext(TAWHID, true, STARTED['kitab-tawhid']);
    expect(ctx.start).toBe('من قوله: <فيه مسائل: الأولى: الخوف من الشرك>…');
    expect(ctx.edition).toBeNull();
    expect(ctx.book).toBe('#/book/kitab-tawhid/0/280?marker=1');
    expect(ctx.bookLabel).toBe('تابع في الكتاب · ص ٢٧٨');
    expect(ctx.status).toEqual({ live: true, text: 'مباشر · الدرس ١٥' });
  });

  it('once the broadcast has ended the status stops claiming live', () => {
    expect(liveContext(TAWHID, false, STARTED['kitab-tawhid']).status).toEqual({ live: false, text: 'انتهى البث' });
    expect(liveContext(undefined, false, null).status).toEqual({ live: false, text: 'انتهى البث' });
  });

  it('unknown start text or page falls back to the previous lesson and page 1', () => {
    const c: CourseDTO = { ...TAWHID, next: { ...TAWHID.next!, startPoint: null, startPage: null } };
    const ctx = liveContext(c, true, STARTED['kitab-tawhid']);
    expect(ctx.start).toBe('يتابع من حيث توقف الدرس ١٤');
    expect(ctx.book).toBe('#/book/kitab-tawhid/0/1');
    expect(ctx.bookLabel).toBe('تابع في الكتاب');
  });

  it('no next lesson: lesson number from the latest one, no start, no book', () => {
    const ctx = liveContext({ ...TAFSIR, next: null }, true, STARTED['tafsir-saadi']);
    expect(ctx.header).toBe('البث المباشر · الدرس ٤٤٤');
    expect([ctx.start, ctx.edition, ctx.book]).toEqual([null, null, null]);
  });

  it('a broadcast outside the courses has a generic title and no lesson', () => {
    const ctx = liveContext(undefined, true, null);
    expect([ctx.title, ctx.header, ctx.start, ctx.book]).toEqual(['البث المباشر', 'البث المباشر', null, null]);
    expect(ctx.status).toEqual({ live: true, text: 'بث مباشر' });
  });
});

describe('listeningLive', () => {
  const recording = { url: 'r', title: '', subtitle: '', kind: 'recording' as const };
  const stream = { url: 's', title: '', subtitle: '', kind: 'live' as const };
  it('is true while the live sheet is open, expanded or collapsed', () => {
    expect(listeningLive(open('kitab-tawhid'), null)).toBe(true);
    expect(listeningLive({ ...open('kitab-tawhid'), view: 'collapsed' }, null)).toBe(true);
  });
  it('is true while a direct stream is loaded in the player', () => {
    expect(listeningLive(CLOSED, stream)).toBe(true);
  });
  it('is false with the sheet closed and nothing or a recording in the player', () => {
    expect(listeningLive(CLOSED, null)).toBe(false);
    expect(listeningLive(CLOSED, recording)).toBe(false);
  });
});

describe('bookBack', () => {
  it("leads to the lesson's tab, which holds the live hero during its broadcast", () => {
    expect(bookBack('tafsir-saadi')).toBe('#/course/tafsir-saadi');
    expect(bookBack('kitab-tawhid')).toBe('#/course/kitab-tawhid');
  });
});

describe('backAction', () => {
  it('the system back button first shrinks the open live player into its bar', () => {
    expect(backAction({ view: 'expanded', courseId: 'kitab-tawhid', startedAt: null }, true)).toBe('collapse');
    expect(backAction({ view: 'expanded', courseId: 'kitab-tawhid', startedAt: null }, false)).toBe('collapse');
  });
  it('otherwise goes back a page, and does nothing on the first page, as the WebView did', () => {
    expect(backAction({ view: 'collapsed', courseId: 'kitab-tawhid', startedAt: null }, true)).toBe('back');
    expect(backAction(CLOSED, true)).toBe('back');
    expect(backAction(CLOSED, false)).toBe('none');
  });
});
