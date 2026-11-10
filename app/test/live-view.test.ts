import { describe, expect, it } from 'vitest';
import type { CourseDTO } from '@albadr/shared';
import { liveContext, nextLiveView, type LiveEvent, type LiveView } from '../src/logic/live';
import { TAFSIR, TAWHID } from './live-state';

describe('nextLiveView', () => {
  const cases: [LiveView, LiveEvent, LiveView][] = [
    ['closed', 'open', 'expanded'],
    ['collapsed', 'open', 'expanded'],
    ['expanded', 'collapse', 'collapsed'],
    ['closed', 'collapse', 'closed'],
    ['collapsed', 'expand', 'expanded'],
    ['expanded', 'navigate', 'collapsed'],
    ['collapsed', 'navigate', 'collapsed'],
    ['closed', 'navigate', 'closed'],
    ['expanded', 'close', 'closed'],
    ['collapsed', 'close', 'closed'],
    ['collapsed', 'play-recording', 'closed'],
    ['expanded', 'play-recording', 'closed'],
    ['closed', 'play-recording', 'closed'],
  ];
  it.each(cases)('%s + %s -> %s', (view, event, expected) => expect(nextLiveView(view, event)).toBe(expected));
});

describe('liveContext', () => {
  it('Tafsir: start text as served, printed page with edition, no book link', () => {
    expect(liveContext(TAFSIR, true)).toEqual({
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
    const ctx = liveContext(TAWHID, true);
    expect(ctx.start).toBe('من قوله: <فيه مسائل: الأولى: الخوف من الشرك>…');
    expect(ctx.edition).toBeNull();
    expect(ctx.book).toBe('#/book/kitab-tawhid/0/280?marker=1');
    expect(ctx.bookLabel).toBe('تابع في الكتاب · ص ٢٨٠');
    expect(ctx.status).toEqual({ live: true, text: 'مباشر · الدرس ١٥' });
  });

  it('once the broadcast has ended the status stops claiming live', () => {
    expect(liveContext(TAWHID, false).status).toEqual({ live: false, text: 'انتهى البث' });
    expect(liveContext(undefined, false).status).toEqual({ live: false, text: 'انتهى البث' });
  });

  it('unknown start text or page falls back to the previous lesson and page 1', () => {
    const c: CourseDTO = { ...TAWHID, next: { ...TAWHID.next, startPoint: null, startPage: null } };
    const ctx = liveContext(c, true);
    expect(ctx.start).toBe('يتابع من حيث توقف الدرس ١٤');
    expect(ctx.book).toBe('#/book/kitab-tawhid/0/1');
    expect(ctx.bookLabel).toBe('تابع في الكتاب');
  });

  it('no next lesson: lesson number from the latest one, no start, no book', () => {
    const ctx = liveContext({ ...TAFSIR, next: null }, true);
    expect(ctx.header).toBe('البث المباشر · الدرس ٤٤٤');
    expect([ctx.start, ctx.edition, ctx.book]).toEqual([null, null, null]);
  });

  it('a broadcast outside the courses has a generic title and no lesson', () => {
    const ctx = liveContext(undefined, true);
    expect([ctx.title, ctx.header, ctx.start, ctx.book]).toEqual(['البث المباشر', 'البث المباشر', null, null]);
    expect(ctx.status).toEqual({ live: true, text: 'بث مباشر' });
  });
});
