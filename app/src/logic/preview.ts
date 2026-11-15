import { lessonNoticeBody, NOTICE_TITLE, prepNoticeBody, type LiveDTO, type PushKind, type StateDTO } from '@sualruhaily/shared';
import { parseRoute } from '../router';
import { liveIntentAction } from './liveIntent';
import type { Card } from './onboarding';
import { routeForPush } from './topics';

// The onboarding's notification preview: a small phone where the notification arrives, grows to be read, is tapped,
// and opens what a tap on the real one opens. Everything it shows at a given moment is decided here.

// What a tap opens: the live player over the lesson, the book at the next passage, or the lesson page.
export type Destination = { kind: 'live' } | { kind: 'stream' } | { kind: 'lesson' } | { kind: 'book'; pdfIndex: number; page: number; marker: boolean };

// Which story the preview tells: the apps' (a notification is tapped), the web's (the page's own buttons are tapped, no
// notification), or the web's invite to the app (the apps' live story, resting on the notification).
export type Variant = 'apps' | 'web' | 'invite';

const PUSH_KIND: Record<Card['kind'], PushKind> = { live: 'live', recording: 'rec', next: 'prep' };

// Asks the app's own routing, so the preview follows wherever a tapped notification is sent.
// On the web, the live hero's button does what `startLive` does: a direct stream plays in the player bar, Mixlr opens its sheet.
export function previewDestination(card: Card, state: StateDTO, variant: Variant = 'apps'): Destination {
  const courseId = card.course.id;
  const kind = PUSH_KIND[card.kind];
  if (variant === 'web' && kind === 'live') return state.live.mode === 'direct' && state.live.streamUrl ? { kind: 'stream' } : { kind: 'live' };
  const route = parseRoute(routeForPush({ kind, courseId, number: '' }, state) ?? '#/');
  if (route.name === 'book') return { kind: 'book', pdfIndex: route.pdfIndex, page: route.page, marker: route.marker };
  const onAir = { ...state, live: { ...state.live, isLive: true, courseId } };
  if (kind === 'live' && liveIntentAction({ courseId }, onAir, true, false) === 'open') return { kind: 'live' };
  return { kind: 'lesson' };
}

export interface Frame {
  banner: 'hidden' | 'small' | 'big' | 'gone';
  opened: boolean;
  // How the phone is framed: as it is, slid up to show the highlighted card, or slid up to show the bottom of its screen.
  focus: 'top' | 'target' | 'bottom';
  spot: boolean;
  tap: 'banner' | 'listen' | 'play' | 'tick' | 'live' | 'book' | null;
  // Live: Mixlr plays. Review: the app's player plays the recording, until it has ended.
  playing: boolean;
  ended: boolean;
  done: boolean;
  fade: boolean;
  still: boolean;
}

type BeatName = 'idle' | 'small' | 'big' | 'tap' | 'gone' | 'open' | 'aim' | 'spot' | 'bottom' | 'tapLive' | 'tapBook' | 'tapListen' | 'tapPlay' | 'playing' | 'ended' | 'tapTick' | 'done' | 'out' | 'end';
export interface Beat {
  name: BeatName;
  at: number;
}

const beats = (...list: [BeatName, number][]): Beat[] => list.map(([name, at]) => ({ name, at }));
const OPENING: [BeatName, number][] = [['idle', 0], ['small', 600], ['big', 1300], ['tap', 2700], ['gone', 3200], ['open', 3600]];

// How the picture plays once the phone is open: the live player is started, the book's passage is ticked read, the
// recording is listened to then ticked reviewed; a bookless course's lesson page only has its next lesson highlighted.
export type Play = 'live' | 'stream' | 'book' | 'page' | 'review';

export const previewPlay = (card: Card, to: Destination): Play => (to.kind !== 'lesson' ? to.kind : card.kind === 'recording' ? 'review' : 'page');

// Each play's last beat is its length; the one before, the fade out.
export const BEATS: Record<Exclude<Play, 'stream'>, Beat[]> = {
  live: beats(...OPENING, ['bottom', 4400], ['tapPlay', 5400], ['playing', 5800], ['out', 9000], ['end', 9600]),
  book: beats(...OPENING, ['bottom', 4400], ['tapTick', 5600], ['done', 6000], ['out', 8200], ['end', 8800]),
  page: beats(...OPENING, ['spot', 4300], ['out', 7600], ['end', 8200]),
  review: beats(...OPENING, ['spot', 4300], ['tapListen', 5400], ['playing', 5800], ['ended', 8000], ['tapTick', 8600], ['done', 9000], ['out', 11000], ['end', 11600]),
};

// The web's stories start on the lesson page: the phone frames what the finger taps, and nothing arrives first.
export const WEB_BEATS: Record<Play, Beat[]> = {
  live: beats(['idle', 0], ['aim', 600], ['tapLive', 1400], ['open', 1800], ['bottom', 2600], ['tapPlay', 3600], ['playing', 4000], ['out', 7200], ['end', 7800]),
  stream: beats(['idle', 0], ['aim', 600], ['tapLive', 1400], ['playing', 1800], ['out', 5000], ['end', 5600]),
  book: beats(['idle', 0], ['spot', 600], ['tapBook', 1700], ['open', 2100], ['bottom', 2900], ['tapTick', 4100], ['done', 4500], ['out', 6700], ['end', 7300]),
  page: beats(['idle', 0], ['spot', 600], ['out', 3900], ['end', 4500]),
  review: beats(['idle', 0], ['spot', 600], ['tapListen', 1700], ['playing', 2100], ['ended', 4300], ['tapTick', 4900], ['done', 5300], ['out', 7300], ['end', 7900]),
};

export const beatsFor = (play: Play, variant: Variant): Beat[] => (variant === 'web' || play === 'stream' ? WEB_BEATS[play] : BEATS[play]);

export const PLAYS = 2;

// The drawn recording's length, in seconds: about an hour, as a lesson is.
export const PREVIEW_DURATION = 3600;

const QUIET: Frame = { banner: 'hidden', opened: false, focus: 'top', spot: false, tap: null, playing: false, ended: false, done: false, fade: false, still: false };
// What a beat changes; later beats keep it, except a tap, which lasts its own beat.
const SETS: Partial<Record<BeatName, Partial<Frame>>> = {
  small: { banner: 'small' },
  big: { banner: 'big' },
  gone: { banner: 'gone' },
  open: { opened: true, spot: false, focus: 'top' },
  aim: { focus: 'target' },
  spot: { spot: true, focus: 'target' },
  bottom: { focus: 'bottom' },
  playing: { playing: true, focus: 'bottom' },
  ended: { playing: false, ended: true },
  done: { done: true },
  out: { fade: true },
};
const TAPS: Partial<Record<BeatName, Frame['tap']>> = { tap: 'banner', tapLive: 'live', tapBook: 'book', tapListen: 'listen', tapPlay: 'play', tapTick: 'tick' };

const frameAt = (list: Beat[], i: number): Frame => ({ ...list.slice(0, i + 1).reduce((f, b) => ({ ...f, ...SETS[b.name] }), QUIET), tap: TAPS[list[i].name] ?? null });

// The frame the preview rests on: where the story ends, just before it fades out. The invite rests on its notification instead.
export function still(play: Play, variant: Variant = 'apps'): Frame {
  const list = beatsFor(play, variant);
  const at = variant === 'invite' ? list.findIndex((b) => b.name === 'big') : list.findIndex((b) => b.name === 'out') - 1;
  return { ...frameAt(list, at), tap: null, still: true };
}

// What the preview shows `elapsed` ms after it started, and how long until that changes (null: it rests from now on).
export function previewAt(play: Play, elapsed: number, reduced: boolean, variant: Variant = 'apps'): { frame: Frame; wait: number | null } {
  const list = beatsFor(play, variant);
  const length = list.at(-1)!.at;
  if (reduced || elapsed >= PLAYS * length) return { frame: still(play, variant), wait: null };
  const t = elapsed % length;
  let i = 0;
  while (list[i + 1].at <= t) i++;
  return { frame: frameAt(list, i), wait: list[i + 1].at - t };
}

// Layout constants, in the panel's px, shared with the .pv rules in app.css.
export const PHONE_WIDTH = 390;
export const PHONE_HEIGHT = 844;
export const STATUS_BAR = 44;
const PHONE_TOP = 14;
const BEZEL = 5;
// Kept clear at the bottom of the panel for the caption.
export const CAPTION_ROOM = 46;

// The phone takes about half the panel; the notification starts as wide as the phone's screen and grows to its own width.
export function previewGeometry(panelWidth: number): { scale: number; bannerWidth: number; bannerScale: number } {
  const scale = Math.min(0.5, Math.max(0.34, (panelWidth * 0.52) / PHONE_WIDTH));
  const bannerWidth = Math.min(panelWidth - 28, 360);
  return { scale, bannerWidth, bannerScale: (PHONE_WIDTH * scale * 0.94) / bannerWidth };
}

// How far the phone slides up in the panel (px, never down) so that its screen, down to `bottom` (the screen's px), sits
// above the caption: the panel is shorter than the phone, and the controls the story taps are low on the screen.
export function phonePan(panelHeight: number, scale: number, bottom: number | null): number {
  if (bottom === null) return 0;
  return Math.min(0, panelHeight - CAPTION_ROOM - PHONE_TOP - BEZEL - bottom * scale);
}

export function previewNotice(card: Card, live: LiveDTO): { title: string; body: string } {
  const { course } = card;
  if (card.kind === 'live') return { title: NOTICE_TITLE.live, body: lessonNoticeBody(course.title, course.place) };
  if (card.kind === 'recording') return { title: NOTICE_TITLE.rec, body: `${course.title} · ${card.lesson.label}` };
  return { title: NOTICE_TITLE.prep, body: prepNoticeBody(course.title, course.place, card.next.startPoint) };
}
