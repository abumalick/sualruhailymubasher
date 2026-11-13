import { NOTICE_TITLE } from '@albadr/shared';
import { describe, expect, it } from 'vitest';
import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { liveIntentAction } from '../src/logic/liveIntent';
import { cardFor } from '../src/logic/onboarding';
import { BEATS, PLAYS, previewAt, previewDestination, previewGeometry, previewNotice, previewPlay, screenOffset, still } from '../src/logic/preview';
import { routeForPush } from '../src/logic/topics';
import { bookHref } from '../src/ui/format';

const [tafsir] = FIXTURE_STATE.courses;
const quiet = FIXTURE_STATE.live;
const loop = (to: keyof typeof BEATS) => BEATS[to].at(-1)!.at;
const at = (to: keyof typeof BEATS, ms: number) => previewAt(to, ms, false).frame;

describe('previewDestination', () => {
  const live = cardFor('live', [tafsir], quiet)!;
  const rec = cardFor('rec', [tafsir], quiet)!;
  const prep = cardFor('prep', [tafsir], quiet)!;

  it('a live notification opens the live player over the lesson, as a tapped one does once the broadcast is confirmed', () => {
    expect(routeForPush({ kind: 'live', courseId: tafsir.id, number: '' }, FIXTURE_STATE)).toBe(`#/course/${tafsir.id}`);
    const onAir = { ...FIXTURE_STATE, live: { ...quiet, isLive: true, courseId: tafsir.id } };
    expect(liveIntentAction({ courseId: tafsir.id }, onAir, true, false)).toBe('open');
    expect(previewDestination(live, FIXTURE_STATE)).toEqual({ kind: 'live' });
  });

  it('a recording notification opens the lesson page', () => {
    expect(routeForPush({ kind: 'rec', courseId: tafsir.id, number: '' }, FIXTURE_STATE)).toBe(`#/course/${tafsir.id}`);
    expect(previewDestination(rec, FIXTURE_STATE)).toEqual({ kind: 'lesson' });
  });

  it('a preparation reminder opens the book at the next passage, marked', () => {
    const next = tafsir.next!;
    expect(routeForPush({ kind: 'prep', courseId: tafsir.id, number: '' }, FIXTURE_STATE)).toBe(bookHref(tafsir, next.pdfIndex, next.startPage, true));
    expect(previewDestination(prep, FIXTURE_STATE)).toEqual({ kind: 'book', pdfIndex: next.pdfIndex ?? 0, page: next.startPage, marker: true });
  });

  it('a preparation reminder for a course without a book opens the lesson page, as the real one does', () => {
    const bookless = { ...tafsir, pdfUrls: [] };
    const state = { ...FIXTURE_STATE, courses: [bookless] };
    expect(previewDestination(cardFor('prep', [bookless], quiet)!, state)).toEqual({ kind: 'lesson' });
  });
});

describe('previewPlay', () => {
  it('only shows the live player and the book; on the lesson page highlights the card, and ticks only the recording', () => {
    const rec = cardFor('rec', [tafsir], quiet)!;
    const prep = cardFor('prep', [tafsir], quiet)!;
    expect(previewPlay(cardFor('live', [tafsir], quiet)!, { kind: 'live' })).toBe('live');
    expect(previewPlay(prep, { kind: 'book', pdfIndex: 0, page: 1, marker: true })).toBe('book');
    expect(previewPlay(rec, { kind: 'lesson' })).toBe('review');
    expect(previewPlay(prep, { kind: 'lesson' })).toBe('page');
  });
});

describe('previewAt', () => {
  it('opens on a quiet phone, then the notification slides down small, then grows to be read', () => {
    expect(at('live', 0)).toMatchObject({ banner: 'hidden', opened: false, spot: false, tap: null });
    expect(at('live', 700).banner).toBe('small');
    expect(at('live', 1400).banner).toBe('big');
  });

  it('taps the grown notification where it stands, then it goes back into the status bar before the phone opens', () => {
    expect(at('live', 2800)).toMatchObject({ banner: 'big', tap: 'banner', opened: false });
    expect(at('live', 3300)).toMatchObject({ banner: 'gone', tap: null, opened: false });
    expect(at('live', 3700)).toMatchObject({ banner: 'gone', opened: true });
  });

  it('the live player and the book are only shown: nothing is highlighted, pressed or ticked in them', () => {
    for (const to of ['live', 'book'] as const) {
      for (let ms = 0; ms < loop(to); ms += 100) {
        const f = at(to, ms);
        expect(f.spot).toBe(false);
        expect(f.tap).not.toBe('tick');
        expect(f.done).toBe(false);
      }
    }
  });

  it('on the lesson page the recording card is highlighted, then a ghost tap ticks it', () => {
    expect(at('review', 4400)).toMatchObject({ opened: true, spot: true, tap: null, done: false });
    expect(at('review', 6100)).toMatchObject({ spot: true, tap: 'tick', done: false });
    expect(at('review', 6500)).toMatchObject({ spot: true, tap: null, done: true });
  });

  it('a preparation reminder that opens the lesson page only highlights the card: «قرأتُه» is never ticked', () => {
    expect(at('page', 4400)).toMatchObject({ opened: true, spot: true });
    for (let ms = 0; ms < loop('page'); ms += 100) {
      expect(at('page', ms).tap).not.toBe('tick');
      expect(at('page', ms).done).toBe(false);
    }
  });

  it('fades out at the end of a play, still ticked, and starts again', () => {
    expect(at('review', loop('review') - 100)).toMatchObject({ fade: true, done: true });
    expect(at('review', loop('review') + 100)).toEqual(at('review', 100));
  });

  it(`plays ${PLAYS} times, then rests on the still frame with nothing left to wait for`, () => {
    for (const to of ['live', 'review', 'page', 'book'] as const) {
      const end = PLAYS * loop(to);
      expect(previewAt(to, end - 1, false).wait).toBeGreaterThan(0);
      expect(previewAt(to, end, false)).toEqual({ frame: still(to), wait: null });
      expect(previewAt(to, end * 3, false)).toEqual({ frame: still(to), wait: null });
    }
  });

  it('with reduced motion, shows only the still frame from the start', () => {
    for (const ms of [0, 1400, 5000]) expect(previewAt('book', ms, true)).toEqual({ frame: still('book'), wait: null });
  });

  it('the still frame shows the notification above what it opened, with no tap; only the lesson card is highlighted', () => {
    expect(still('live')).toEqual({ banner: 'big', opened: true, spot: false, tap: null, done: false, fade: false, still: true });
    expect(still('review').spot).toBe(true);
    expect(still('page').spot).toBe(true);
    expect(still('book').spot).toBe(false);
  });

  it('waits exactly until the next beat', () => {
    const second = BEATS.live[1].at;
    expect(previewAt('live', 0, false).wait).toBe(second);
    expect(previewAt('live', second - 100, false).wait).toBe(100);
  });

  it('every beat table starts at 0, rises, and ends on the loop length', () => {
    for (const list of Object.values(BEATS)) {
      expect(list[0].at).toBe(0);
      for (let i = 1; i < list.length; i++) expect(list[i].at).toBeGreaterThan(list[i - 1].at);
      expect(list.at(-1)!.name).toBe('end');
    }
  });
});

describe('previewGeometry', () => {
  it('draws the phone at about half the panel, within bounds, from 320 to 390 px screens', () => {
    expect(previewGeometry(354).scale).toBeCloseTo((354 * 0.52) / 390);
    expect(previewGeometry(284).scale).toBeCloseTo((284 * 0.52) / 390);
    expect(previewGeometry(100).scale).toBe(0.34);
    expect(previewGeometry(900).scale).toBe(0.5);
  });

  it('starts the notification at the width of the phone screen, so it grows from the phone', () => {
    for (const w of [284, 324, 354, 600]) {
      const g = previewGeometry(w);
      expect(g.bannerScale * g.bannerWidth).toBeCloseTo(390 * g.scale * 0.94);
      expect(g.bannerWidth).toBeLessThanOrEqual(w - 28);
      expect(g.bannerWidth).toBeLessThanOrEqual(360);
    }
  });
});

describe('screenOffset', () => {
  it('scrolls the card to the top of the phone screen once opened', () => {
    expect(screenOffset(400, false, 0.45, 80)).toBe(-386);
  });

  it('never scrolls past the top of the lesson page', () => {
    expect(screenOffset(5, false, 0.45, 80)).toBe(0);
    expect(screenOffset(0, true, 0.45, 80)).toBe(0);
  });

  it('in the still frame, places the card just under the grown notification', () => {
    const scale = 0.45;
    const y = screenOffset(400, true, scale, 80);
    expect(14 + 5 + (44 + 400 + y) * scale).toBeCloseTo(10 + 80 + 12);
  });
});

describe('previewNotice', () => {
  it('uses the title the server sends and names the course and lesson', () => {
    const live = previewNotice(cardFor('live', [tafsir], quiet)!, quiet);
    expect(live).toEqual({ title: NOTICE_TITLE.live, body: `${tafsir.title} · الدرس ٤٤٤` });
    const rec = previewNotice(cardFor('rec', [tafsir], quiet)!, quiet);
    expect(rec).toEqual({ title: NOTICE_TITLE.rec, body: `${tafsir.title} · الدرس ٤٤٣` });
  });

  it('the preparation reminder names the course and where the next lesson starts, as the server writes it', () => {
    const prep = previewNotice(cardFor('prep', [tafsir], quiet)!, quiet);
    expect(prep.title).toBe(NOTICE_TITLE.prep);
    expect(prep.body.startsWith(`${tafsir.title} · `)).toBe(true);
  });
});
