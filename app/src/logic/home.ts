import type { CourseDTO, LessonDTO, NextPassageDTO, StateDTO } from '@albadr/shared';
import type { Ticks } from './ticks';
import { hijriToday, lessonInstant, medinaDate, medinaWeekday, previousDate } from './time';

export type Item =
  | { kind: 'live'; courseId: string | null; lessonNumber: number | null }
  | { kind: 'review'; courseId: string; lesson: LessonDTO; done: boolean }
  | { kind: 'prepare'; courseId: string; next: NextPassageDTO; done: boolean }
  | { kind: 'awaiting-recording'; courseId: string; lessonNumber: number };

type StepState = 'done' | 'current' | 'todo';
export interface HomeModel {
  hero: Item | null;
  cards: Item[];
  steps: { prepare: StepState; lesson: StepState; review: StepState } | null;
  today: { courseId: string; time: string; status: 'live' | 'done' | 'upcoming' }[];
}

const AWAITING_DELAY_MS = 30 * 60_000;

const nextStart = (c: CourseDTO) => (c.next ? lessonInstant(c.next.date, c.next.time).getTime() : Infinity);

function prepareFrom(c: CourseDTO): number {
  const next = c.next!;
  return c.slot === 'fajr'
    ? lessonInstant(previousDate(next.date), '21:00').getTime()
    : lessonInstant(next.date, '15:30').getTime();
}

const hijriKey = (d: string) => d.split('-').reverse().join('');

function todaySession(c: CourseDTO, today: string, weekday: number): { time: string } | null {
  const covers = (e: CourseDTO['exceptions'][number]) => e.dateFrom <= today && today <= (e.dateTo ?? e.dateFrom);
  const ex = c.exceptions;
  if (ex.some((e) => (e.kind === 'cancel' || e.kind === 'pause') && covers(e))) return null;
  const arrival = ex.find((e) => (e.kind === 'move' ? e.dateTo === today : e.kind === 'extra' && covers(e)));
  if (arrival) return { time: arrival.time ?? c.time };
  if (ex.some((e) => e.kind === 'move' && e.dateFrom === today)) return null;
  if (!c.weekdays.includes(weekday)) return null;
  return { time: c.next?.date === today ? c.next.time : c.time };
}

export function buildHome(state: StateDTO, ticks: Ticks, now: Date): HomeModel {
  const today = medinaDate(now);
  const weekday = medinaWeekday(now);
  const hijri = hijriToday(now);
  const nowMs = now.getTime();
  const { live } = state;

  const todayList: HomeModel['today'] = [];
  const perCourse: { course: CourseDTO; items: Item[] }[] = [];

  for (const c of state.courses) {
    const isLive = live.isLive && live.courseId === c.id;
    const latest = c.latest[0];
    const items: Item[] = [];
    const session = todaySession(c, today, weekday);

    if (session) {
      const start = lessonInstant(today, session.time).getTime();
      const recordedToday = latest?.hijriDate === hijri;
      todayList.push({
        courseId: c.id,
        time: session.time,
        status: isLive ? 'live' : recordedToday || nowMs >= start ? 'done' : 'upcoming',
      });
    }

    if (latest?.recordingUrl && nowMs < nextStart(c)) {
      items.push({ kind: 'review', courseId: c.id, lesson: latest, done: ticks.reviewed.has(`${c.id}:${latest.number}`) });
    }

    let awaiting: number | null = null;
    if (!isLive) {
      if (latest?.hijriDate === hijri && !latest.recordingUrl) awaiting = latest.number;
      else if (session && latest && latest.hijriDate !== hijri && nowMs >= lessonInstant(today, session.time).getTime() + AWAITING_DELAY_MS) {
        awaiting = latest.number + 1;
      }
    }
    if (awaiting !== null) items.push({ kind: 'awaiting-recording', courseId: c.id, lessonNumber: awaiting });

    if (c.next && !isLive && awaiting === null) {
      items.push({ kind: 'prepare', courseId: c.id, next: c.next, done: ticks.read.has(`${c.id}:${c.next.number}`) });
    }
    perCourse.push({ course: c, items });
  }

  const byNext = perCourse
    .filter((p) => p.items.length > 0)
    .sort((a, b) => nextStart(a.course) - nextStart(b.course));
  const flat = (list: typeof byNext) => list.flatMap((p) => p.items);

  if (live.isLive) {
    const course = state.courses.find((c) => c.id === live.courseId);
    const lessonNumber = course ? (course.latest[0]?.number ?? 0) + 1 : null;
    const hero: Item = { kind: 'live', courseId: live.courseId, lessonNumber };
    const steps = course
      ? {
          prepare: ticks.read.has(`${course.id}:${lessonNumber}`) ? ('done' as const) : ('todo' as const),
          lesson: 'current' as const,
          review: 'todo' as const,
        }
      : null;
    return { hero, cards: flat(byNext), steps, today: todayList };
  }

  const upcoming = byNext.filter((p) => nextStart(p.course) > nowMs);
  const focus = upcoming[0] ?? byNext[0];
  if (!focus) return { hero: null, cards: [], steps: null, today: todayList };

  const prepare = focus.items.find((i): i is Extract<Item, { kind: 'prepare' }> => i.kind === 'prepare');
  const freshestReview = byNext
    .flatMap((p) => p.items)
    .filter((i): i is Extract<Item, { kind: 'review' }> => i.kind === 'review' && !i.done)
    .sort((x, y) => hijriKey(y.lesson.hijriDate).localeCompare(hijriKey(x.lesson.hijriDate)))[0];

  let hero: Item;
  if (prepare && nowMs >= prepareFrom(focus.course)) hero = prepare;
  else hero = freshestReview ?? prepare ?? focus.items.find((i) => i.kind === 'awaiting-recording') ?? focus.items[0];

  const cards = flat(byNext).filter((i) => i !== hero);
  const c = state.courses.find((x) => x.id === (hero as { courseId: string }).courseId)!;
  const readTick = (n: number) => (ticks.read.has(`${c.id}:${n}`) ? ('done' as const) : null);

  let steps: HomeModel['steps'];
  if (hero.kind === 'prepare') {
    steps = { prepare: readTick(hero.next.number) ?? 'current', lesson: 'todo', review: 'todo' };
  } else if (hero.kind === 'review') {
    steps = { prepare: 'done', lesson: 'done', review: 'current' };
  } else {
    const n = (hero as Extract<Item, { kind: 'awaiting-recording' }>).lessonNumber;
    steps = { prepare: readTick(n) ?? 'todo', lesson: 'done', review: 'todo' };
  }
  return { hero, cards, steps, today: todayList };
}
