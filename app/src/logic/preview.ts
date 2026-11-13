import { lessonNoticeBody, NOTICE_TITLE, prepNoticeBody, type LiveDTO, type PushKind, type StateDTO } from '@albadr/shared';
import { parseRoute } from '../router';
import { liveLesson } from './live';
import { liveIntentAction } from './liveIntent';
import type { Card } from './onboarding';
import { routeForPush } from './topics';

// The onboarding's notification preview: a small phone where the notification arrives, grows to be read, is tapped,
// and opens what a tap on the real one opens. Everything it shows at a given moment is decided here.

// What a tap opens: the live player over the lesson, the book at the next passage, or the lesson page.
export type Destination = { kind: 'live' } | { kind: 'lesson' } | { kind: 'book'; pdfIndex: number; page: number; marker: boolean };

const PUSH_KIND: Record<Card['kind'], PushKind> = { live: 'live', recording: 'rec', next: 'prep' };

// Asks the app's own routing, so the preview follows wherever a tapped notification is sent.
export function previewDestination(card: Card, state: StateDTO): Destination {
  const courseId = card.course.id;
  const kind = PUSH_KIND[card.kind];
  const route = parseRoute(routeForPush({ kind, courseId, number: '' }, state) ?? '#/');
  if (route.name === 'book') return { kind: 'book', pdfIndex: route.pdfIndex, page: route.page, marker: route.marker };
  const onAir = { ...state, live: { ...state.live, isLive: true, courseId } };
  if (kind === 'live' && liveIntentAction({ courseId }, onAir, true, false) === 'open') return { kind: 'live' };
  return { kind: 'lesson' };
}

export interface Frame {
  banner: 'hidden' | 'small' | 'big' | 'gone';
  opened: boolean;
  spot: boolean;
  tap: 'banner' | 'tick' | null;
  done: boolean;
  fade: boolean;
  still: boolean;
}

type BeatName = 'idle' | 'small' | 'big' | 'tap' | 'gone' | 'open' | 'spot' | 'press' | 'done' | 'out' | 'end';
export interface Beat {
  name: BeatName;
  at: number;
}

const beats = (...list: [BeatName, number][]): Beat[] => list.map(([name, at]) => ({ name, at }));
const OPENING: [BeatName, number][] = [['idle', 0], ['small', 600], ['big', 1300], ['tap', 2700], ['gone', 3200], ['open', 3600]];

// How the picture plays once the phone is open: the live player and the book are only shown; on the lesson page the
// card is highlighted, and the recording's is then ticked «راجعتُه» (the book's «قرأتُه» sits below what the phone shows).
export type Play = 'live' | 'book' | 'page' | 'review';

export const previewPlay = (card: Card, to: Destination): Play => (to.kind !== 'lesson' ? to.kind : card.kind === 'recording' ? 'review' : 'page');

// Each play's last beat is its length.
export const BEATS: Record<Play, Beat[]> = {
  live: beats(...OPENING, ['out', 7600], ['end', 8200]),
  book: beats(...OPENING, ['out', 7600], ['end', 8200]),
  page: beats(...OPENING, ['spot', 4300], ['out', 7600], ['end', 8200]),
  review: beats(...OPENING, ['spot', 4300], ['press', 6000], ['done', 6400], ['out', 8600], ['end', 9200]),
};
export const PLAYS = 2;

const QUIET: Frame = { banner: 'hidden', opened: false, spot: false, tap: null, done: false, fade: false, still: false };
// What a beat changes; later beats keep it, except a tap, which lasts its own beat.
const SETS: Partial<Record<BeatName, Partial<Frame>>> = {
  small: { banner: 'small' },
  big: { banner: 'big' },
  gone: { banner: 'gone' },
  open: { opened: true },
  spot: { spot: true },
  done: { done: true },
  out: { fade: true },
};
const TAPS: Partial<Record<BeatName, Frame['tap']>> = { tap: 'banner', press: 'tick' };

// The frame the preview rests on: the notification above what it opened.
export const still = (play: Play): Frame => ({ ...QUIET, banner: 'big', opened: true, spot: play === 'page' || play === 'review', still: true });

// What the preview shows `elapsed` ms after it started, and how long until that changes (null: it rests from now on).
export function previewAt(play: Play, elapsed: number, reduced: boolean): { frame: Frame; wait: number | null } {
  const list = BEATS[play];
  const length = list.at(-1)!.at;
  if (reduced || elapsed >= PLAYS * length) return { frame: still(play), wait: null };
  const t = elapsed % length;
  let i = 0;
  while (list[i + 1].at <= t) i++;
  const frame = list.slice(0, i + 1).reduce((f, b) => ({ ...f, ...SETS[b.name] }), QUIET);
  return { frame: { ...frame, tap: TAPS[list[i].name] ?? null }, wait: list[i + 1].at - t };
}

// Layout constants, in the panel's px, shared with the .pv rules in app.css.
export const PHONE_WIDTH = 390;
const PHONE_TOP = 14;
const BEZEL = 5;
const STATUS_BAR = 44;
const BANNER_TOP = 10;
const BANNER_GAP = 12;

// The phone takes about half the panel; the notification starts as wide as the phone's screen and grows to its own width.
export function previewGeometry(panelWidth: number): { scale: number; bannerWidth: number; bannerScale: number } {
  const scale = Math.min(0.5, Math.max(0.34, (panelWidth * 0.52) / PHONE_WIDTH));
  const bannerWidth = Math.min(panelWidth - 28, 360);
  return { scale, bannerWidth, bannerScale: (PHONE_WIDTH * scale * 0.94) / bannerWidth };
}

// How far the lesson page inside the phone scrolls (its own px, never past its top) to show the card at `cardTop`:
// to the top of the screen once opened; in the still frame, just under the grown notification.
export function screenOffset(cardTop: number, still: boolean, scale: number, bannerHeight: number): number {
  const y = still ? (BANNER_TOP + bannerHeight + BANNER_GAP - PHONE_TOP - BEZEL) / scale - STATUS_BAR - cardTop : 14 - cardTop;
  return Math.min(0, y);
}

export function previewNotice(card: Card, live: LiveDTO): { title: string; body: string } {
  const { course } = card;
  if (card.kind === 'live') return { title: NOTICE_TITLE.live, body: lessonNoticeBody(course.title, liveLesson(course, live.courseId === course.id ? live.startedAt : null).number) };
  if (card.kind === 'recording') return { title: NOTICE_TITLE.rec, body: lessonNoticeBody(course.title, card.lesson.number) };
  return { title: NOTICE_TITLE.prep, body: prepNoticeBody(course.title, card.next.startPoint, card.next.number) };
}
