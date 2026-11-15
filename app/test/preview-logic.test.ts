import { NOTICE_TITLE } from '@sualruhaily/shared';
import { describe, expect, it } from 'vitest';
import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { liveIntentAction } from '../src/logic/liveIntent';
import { cardFor } from '../src/logic/onboarding';
import { BEATS, beatsFor, CAPTION_ROOM, PHONE_HEIGHT, phonePan, PLAYS, previewAt, previewDestination, previewGeometry, previewNotice, previewPlay, still, type Play } from '../src/logic/preview';
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

describe('the web variant', () => {
  const live = cardFor('live', [tafsir], quiet)!;
  const rec = cardFor('rec', [tafsir], quiet)!;
  const prep = cardFor('prep', [tafsir], quiet)!;
  const direct = { ...FIXTURE_STATE, live: { ...quiet, mode: 'direct' as const, streamUrl: 'https://stream.example/live.mp3' } };
  const webAt = (to: Play, ms: number) => previewAt(to, ms, false, 'web').frame;

  it('live opens the Mixlr player when the broadcast is embedded, the player bar when it is a direct stream', () => {
    expect(previewDestination(live, FIXTURE_STATE, 'web')).toEqual({ kind: 'live' });
    expect(previewDestination(live, direct, 'web')).toEqual({ kind: 'stream' });
    expect(previewDestination(live, direct, 'apps')).toEqual({ kind: 'live' });
    expect(previewPlay(live, { kind: 'stream' })).toBe('stream');
  });

  it('recording and preparation go where the page’s own buttons lead, the same places as the apps', () => {
    expect(previewDestination(rec, FIXTURE_STATE, 'web')).toEqual(previewDestination(rec, FIXTURE_STATE, 'apps'));
    expect(previewDestination(prep, FIXTURE_STATE, 'web')).toEqual(previewDestination(prep, FIXTURE_STATE, 'apps'));
  });

  it('no frame of any play shows a notification', () => {
    for (const play of ['live', 'stream', 'book', 'page', 'review'] as const)
      for (let ms = 0; ms < 2 * beatsFor(play, 'web').at(-1)!.at; ms += 100) expect(webAt(play, ms).banner).toBe('hidden');
  });

  it('live: the phone slides to the disc, it is tapped, the player opens at its top, Mixlr’s play is tapped and it plays', () => {
    expect(webAt('live', 0)).toMatchObject({ opened: false, tap: null, focus: 'top' });
    expect(webAt('live', 700)).toMatchObject({ focus: 'target', spot: false });
    expect(webAt('live', 1500)).toMatchObject({ tap: 'live', opened: false, focus: 'target' });
    expect(webAt('live', 1900)).toMatchObject({ opened: true, tap: null, focus: 'top' });
    expect(webAt('live', 3700)).toMatchObject({ focus: 'bottom', tap: 'play' });
    expect(webAt('live', 4100)).toMatchObject({ playing: true });
  });

  it('stream: the disc is tapped and the player bar plays the broadcast', () => {
    expect(webAt('stream', 1500).tap).toBe('live');
    expect(webAt('stream', 1900)).toMatchObject({ playing: true, focus: 'bottom' });
  });

  it('book: the next card is highlighted, its book chip tapped, the book opens and «قرأتُه» is ticked', () => {
    expect(webAt('book', 700)).toMatchObject({ spot: true, focus: 'target', opened: false });
    expect(webAt('book', 1800).tap).toBe('book');
    expect(webAt('book', 2200)).toMatchObject({ opened: true, spot: false, focus: 'top' });
    expect(webAt('book', 4600).done).toBe(true);
  });

  it('review and page: the apps’ story from the highlighted card on, without the notification', () => {
    expect(webAt('review', 700)).toMatchObject({ spot: true, opened: false });
    expect(webAt('review', 1800).tap).toBe('listen');
    expect(webAt('review', 5400).done).toBe(true);
    expect(webAt('page', 700).spot).toBe(true);
  });

  it('the still frames are the end of each story', () => {
    expect(still('live', 'web')).toMatchObject({ opened: true, playing: true, banner: 'hidden', still: true });
    expect(still('book', 'web')).toMatchObject({ opened: true, done: true, still: true });
    expect(previewAt('live', 0, true, 'web').frame).toEqual(still('live', 'web'));
  });
});

describe('the invite variant', () => {
  it('plays the apps’ live story but rests on the grown notification over the dimmed page', () => {
    expect(beatsFor('live', 'invite')).toBe(BEATS.live);
    expect(still('live', 'invite')).toMatchObject({ banner: 'big', opened: false, tap: null, still: true });
    expect(previewAt('live', 0, true, 'invite').frame).toEqual(still('live', 'invite'));
    expect(previewAt('live', PLAYS * loop('live'), false, 'invite').frame).toEqual(still('live', 'invite'));
  });
});
