import { describe, expect, it } from 'vitest';
import type { CourseDTO } from '@sualruhaily/shared';
import { backAction, bookBack, CLOSED, listeningLive, liveContext, liveLesson, nextLivePlayer, type LiveEvent, type LivePlayer } from '../src/logic/live';
import { endedState, liveDTO, STARTED, TAFSIR, TAWHID, TAWHID_14 } from './live-state';

const open = (courseId: string): LivePlayer => ({ view: 'expanded', courseId, startedAt: STARTED[courseId] });
const ev = (type: 'expand' | 'collapse' | 'navigate' | 'close' | 'play-recording'): LiveEvent => ({ type });

describe('nextLivePlayer', () => {
  it('opening takes the broadcast course and start', () => {
    expect(nextLivePlayer(CLOSED, { type: 'open', live: liveDTO('kabair') })).toEqual(open('kabair'));
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
    expect(nextLivePlayer({ ...open('kabair'), view }, e).view).toBe(expected);
  });

  it('closing forgets the broadcast', () => {
    expect(nextLivePlayer(open('kabair'), ev('close'))).toEqual(CLOSED);
  });

  it('a closed player stays closed whatever happens', () => {
    for (const e of [ev('expand'), ev('collapse'), ev('navigate'), ev('close'), ev('play-recording'), { type: 'state', live: liveDTO('kitab-tawhid') } as LiveEvent]) {
      expect(nextLivePlayer(CLOSED, e)).toEqual(CLOSED);
    }
  });

  it('keeps the course and start once the server reports the end with no course', () => {
    const p = { ...open('kabair'), view: 'collapsed' as const };
    expect(nextLivePlayer(p, { type: 'state', live: endedState().live })).toBe(p);
  });

  it('follows a new broadcast while open', () => {
    expect(nextLivePlayer(open('kabair'), { type: 'state', live: liveDTO('kitab-tawhid') })).toEqual(open('kitab-tawhid'));
  });
});

describe('liveLesson', () => {
  const flipped: CourseDTO = {
    ...TAWHID,
    unpublished: 1,
    next: { ...TAWHID.next!, date: '2026-11-03', startPoint: null, startPage: 285, estEndPage: 290, estimated: true },
  };

  it('the next lesson is the one on air when it is dated the broadcast day, and has no label before it is published', () => {
    expect(liveLesson(TAWHID, STARTED['kabair'])).toEqual({
      label: null,
      start: { startPoint: TAWHID_14.endPoint, pdfIndex: 0, startPage: 280 },
    });
  });

  it('a long broadcast keeps its lesson after next has moved on: starts where the previous lesson ended', () => {
    expect(liveLesson(flipped, STARTED['kabair'])).toEqual({
      label: null,
      start: { startPoint: 'من قوله: <فيه مسائل: الأولى: الخوف من الشرك>…', pdfIndex: 0, startPage: 280 },
    });
  });

  it('after next has moved on, a published lesson on air gives its own start', () => {
    const published = { ...flipped, unpublished: 0, latest: [{ ...TAWHID_14, number: 15, label: 'المجلس ١٥', startPoint: 'بداية الدرس ١٥', startPage: 281 }, ...flipped.latest] };
    expect(liveLesson(published, STARTED['kabair'])).toEqual({ label: 'المجلس ١٥', start: { startPoint: 'بداية الدرس ١٥', pdfIndex: 0, startPage: 281 } });
  });

  it('after next has moved on with no known previous end, the start is unknown', () => {
    expect(liveLesson({ ...flipped, latest: [] }, STARTED['kabair'])).toEqual({ label: null, start: null });
  });

  it('a lesson published while still on air stays the lesson, although next already counts past it', () => {
    const fifteen = { ...TAWHID_14, number: 15, label: 'المجلس ١٥', hijriDate: '22-05-1448', startPoint: TAWHID_14.endPoint!, startPage: 280, endPoint: null, endPage: null };
    const published: CourseDTO = {
      ...TAWHID,
      latest: [fifteen, ...TAWHID.latest],
      next: { ...TAWHID.next!, date: '2026-11-02', startPoint: null, startPage: 285, estimated: true },
    };
    expect(liveLesson(published, STARTED['kabair'])).toEqual({
      label: 'المجلس ١٥',
      start: { startPoint: 'من قوله: <فيه مسائل: الأولى: الخوف من الشرك>…', pdfIndex: 0, startPage: 280 },
    });
  });

  it('a broadcast that runs past Medina midnight keeps next when next is dated the day before', () => {
    expect(liveLesson(TAWHID, '2026-11-02T21:30:00Z').start?.startPage).toBe(280);
  });

  it('without a broadcast start or next lesson it falls back', () => {
    expect(liveLesson(TAWHID, null)).toMatchObject({ label: null, start: { startPage: 280 } });
    expect(liveLesson(TAWHID, 'not a date')).toMatchObject({ label: null, start: { startPage: 280 } });
    expect(liveLesson({ ...TAFSIR, next: null }, STARTED['kitab-tawhid'])).toEqual({ label: null, start: null });
  });
});

describe('liveContext', () => {
  it('Tafsir: start text as served, printed page with edition, no book link', () => {
    expect(liveContext(TAFSIR, true, STARTED['kitab-tawhid'])).toEqual({
      title: 'شرح كتاب التوحيد',
      header: 'البث المباشر',
      start: 'تفسير سورة التوبة: من الآية (٨) ﴿كَيْفَ وَإِنْ يَظْهَرُوا عَلَيْكُمْ لَا يَرْقُبُوا فِيكُمْ إِلًّا وَلَا ذِمَّةً...﴾',
      edition: 'ص ٦٣٦ · طبعة دار ابن الجوزي',
      book: null,
      bookLabel: 'تابع في الكتاب · ص ٦٣٦',
      status: { live: true, text: 'بث مباشر · ص ٦٣٦ · طبعة دار ابن الجوزي' },
    });
  });

  it('evening course: book link at the start page with the marker', () => {
    const ctx = liveContext(TAWHID, true, STARTED['kabair']);
    expect(ctx.start).toBe('من قوله: <فيه مسائل: الأولى: الخوف من الشرك>…');
    expect(ctx.edition).toBeNull();
    expect(ctx.book).toBe('#/book/kabair/0/280?marker=1');
    expect(ctx.bookLabel).toBe('تابع في الكتاب · ص ٢٧٨');
    expect(ctx.status).toEqual({ live: true, text: 'بث مباشر' });
  });

  it('once the broadcast has ended the status stops claiming live', () => {
    expect(liveContext(TAWHID, false, STARTED['kabair']).status).toEqual({ live: false, text: 'انتهى البث' });
    expect(liveContext(undefined, false, null).status).toEqual({ live: false, text: 'انتهى البث' });
  });

  it('unknown start text or page falls back to the previous lesson and page 1', () => {
    const c: CourseDTO = { ...TAWHID, next: { ...TAWHID.next!, startPoint: null, startPage: null } };
    const ctx = liveContext(c, true, STARTED['kabair']);
    expect(ctx.start).toBe('يتابع من حيث توقف المجلس ١٤');
    expect(ctx.book).toBe('#/book/kabair/0/1');
    expect(ctx.bookLabel).toBe('تابع في الكتاب');
  });

  it('no next lesson: no label, no start, no book', () => {
    const ctx = liveContext({ ...TAFSIR, next: null }, true, STARTED['kitab-tawhid']);
    expect(ctx.header).toBe('البث المباشر');
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
    expect(listeningLive(open('kabair'), null)).toBe(true);
    expect(listeningLive({ ...open('kabair'), view: 'collapsed' }, null)).toBe(true);
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
    expect(bookBack('kitab-tawhid')).toBe('#/course/kitab-tawhid');
    expect(bookBack('kabair')).toBe('#/course/kabair');
  });
});

describe('backAction', () => {
  it('the system back button first shrinks the open live player into its bar', () => {
    expect(backAction({ view: 'expanded', courseId: 'kabair', startedAt: null }, true)).toBe('collapse');
    expect(backAction({ view: 'expanded', courseId: 'kabair', startedAt: null }, false)).toBe('collapse');
  });
  it('otherwise goes back a page, and does nothing on the first page, as the WebView did', () => {
    expect(backAction({ view: 'collapsed', courseId: 'kabair', startedAt: null }, true)).toBe('back');
    expect(backAction(CLOSED, true)).toBe('back');
    expect(backAction(CLOSED, false)).toBe('none');
  });
});
