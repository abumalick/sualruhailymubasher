import { NOTICE_TITLE } from '@albadr/shared';
import { describe, expect, it } from 'vitest';
import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { liveIntentAction } from '../src/logic/liveIntent';
import { cardFor } from '../src/logic/onboarding';
import { BEATS, CAPTION_ROOM, PHONE_HEIGHT, phonePan, PLAYS, previewAt, previewDestination, previewGeometry, previewNotice, previewPlay, still } from '../src/logic/preview';
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
  it('plays the live player, reads the book, reviews the recording, and only shows the lesson page of a bookless course', () => {
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
    expect(at('live', 0)).toMatchObject({ banner: 'hidden', opened: false, spot: false, tap: null, focus: 'top' });
    expect(at('live', 700).banner).toBe('small');
    expect(at('live', 1400).banner).toBe('big');
  });

  it('taps the grown notification where it stands, then it goes back into the status bar before the phone opens', () => {
    expect(at('live', 2800)).toMatchObject({ banner: 'big', tap: 'banner', opened: false });
    expect(at('live', 3300)).toMatchObject({ banner: 'gone', tap: null, opened: false });
    expect(at('live', 3700)).toMatchObject({ banner: 'gone', opened: true });
  });

  it('live: the player opens at its top, then the phone shows Mixlr’s controls, the play button is tapped and it plays', () => {
    expect(at('live', 3700)).toMatchObject({ focus: 'top', playing: false });
    expect(at('live', 4500)).toMatchObject({ focus: 'bottom', playing: false, tap: null });
    expect(at('live', 5500)).toMatchObject({ focus: 'bottom', tap: 'play', playing: false });
    expect(at('live', 5900)).toMatchObject({ tap: null, playing: true });
  });

  it('live: nothing is highlighted or ticked, and nothing plays before the tap on play', () => {
    for (let ms = 0; ms < loop('live'); ms += 100) {
      const f = at('live', ms);
      expect(f.spot).toBe(false);
      expect(f.done).toBe(false);
      if (f.playing) expect(ms).toBeGreaterThanOrEqual(BEATS.live.find((b) => b.name === 'playing')!.at);
    }
  });

  it('book: opens at the passage, then the phone shows the footer with «قرأتُه» not yet ticked, then it is tapped and ticked', () => {
    expect(at('book', 3700)).toMatchObject({ focus: 'top', done: false });
    expect(at('book', 4500)).toMatchObject({ focus: 'bottom', done: false, tap: null });
    expect(at('book', 5700)).toMatchObject({ tap: 'tick', done: false });
    expect(at('book', 6100)).toMatchObject({ tap: null, done: true });
    for (let ms = 0; ms < loop('book'); ms += 100) expect(at('book', ms).playing).toBe(false);
  });

  it('review: the recording card is highlighted, «استمع» is tapped, the player plays it to the end, then «راجعتُه» is ticked', () => {
    expect(at('review', 4400)).toMatchObject({ opened: true, spot: true, focus: 'target', tap: null, playing: false, done: false });
    expect(at('review', 5500)).toMatchObject({ tap: 'listen', playing: false });
    expect(at('review', 5900)).toMatchObject({ tap: null, playing: true, ended: false, focus: 'bottom' });
    expect(at('review', 8100)).toMatchObject({ playing: false, ended: true, done: false });
    expect(at('review', 8700)).toMatchObject({ tap: 'tick', ended: true, done: false });
    expect(at('review', 9100)).toMatchObject({ tap: null, ended: true, done: true });
  });

  it('a preparation reminder that opens the lesson page only highlights the card: «قرأتُه» is never ticked', () => {
    expect(at('page', 4400)).toMatchObject({ opened: true, spot: true, focus: 'target' });
    for (let ms = 0; ms < loop('page'); ms += 100) {
      expect(at('page', ms).tap).not.toBe('tick');
      expect(at('page', ms).done).toBe(false);
      expect(at('page', ms).playing).toBe(false);
    }
  });

  it('fades out at the end of a play, in its end state, and starts again', () => {
    expect(at('review', loop('review') - 100)).toMatchObject({ fade: true, done: true, ended: true });
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

  it('the still frame is the end of the story, in the app: no notification, no tap, nothing fading', () => {
    for (const to of ['live', 'review', 'page', 'book'] as const) {
      const f = still(to);
      expect(f.banner === 'hidden' || f.banner === 'gone').toBe(true);
      expect(f).toMatchObject({ opened: true, tap: null, fade: false, still: true });
      const lastBeforeOut = BEATS[to].find((b) => b.name === 'out')!.at - 1;
      expect({ ...f, still: false }).toEqual({ ...at(to, lastBeforeOut), tap: null });
    }
  });

  it('the still frames: live plays, the recording is listened to and ticked, the book’s passage is ticked read', () => {
    expect(still('live')).toMatchObject({ focus: 'bottom', playing: true, done: false, spot: false });
    expect(still('review')).toMatchObject({ focus: 'bottom', playing: false, ended: true, done: true, spot: true });
    expect(still('book')).toMatchObject({ focus: 'bottom', done: true, spot: false });
    expect(still('page')).toMatchObject({ focus: 'target', done: false, spot: true });
  });

  it('waits exactly until the next beat', () => {
    const second = BEATS.live[1].at;
    expect(previewAt('live', 0, false).wait).toBe(second);
    expect(previewAt('live', second - 100, false).wait).toBe(100);
  });

  it('every beat table starts at 0, rises, fades out, and ends on the loop length', () => {
    for (const list of Object.values(BEATS)) {
      expect(list[0].at).toBe(0);
      for (let i = 1; i < list.length; i++) expect(list[i].at).toBeGreaterThan(list[i - 1].at);
      expect(list.at(-2)!.name).toBe('out');
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

describe('phonePan', () => {
  const panelY = (screenY: number, scale: number, pan: number) => 14 + 5 + screenY * scale + pan;

  it('leaves the phone where it is when nothing below has to be shown', () => {
    expect(phonePan(340, 0.47, null)).toBe(0);
  });

  it('leaves it when what must be seen is already above the caption', () => {
    expect(phonePan(340, 0.47, 300)).toBe(0);
  });

  it('slides the phone up just enough to bring the bottom of the screen above the caption, on small and large panels', () => {
    for (const [height, scale] of [[180, 0.379], [340, 0.472]]) {
      const pan = phonePan(height, scale, PHONE_HEIGHT);
      expect(pan).toBeLessThan(0);
      expect(panelY(PHONE_HEIGHT, scale, pan)).toBeCloseTo(height - CAPTION_ROOM);
    }
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
