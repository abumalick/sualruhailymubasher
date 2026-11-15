import { courseTopic, LIVE_OTHER_TOPIC, type CourseDTO, type Slot } from '@sualruhaily/shared';
import { COURSE_KINDS, topicsFor } from './topics';

export type Kind = (typeof COURSE_KINDS)[number];

// wanted: what the listener chose, kept for courses that left the list; known: every course seen, in order.
export interface Prefs {
  wanted: string[];
  known: [id: string, slot: Slot][];
}

// The record older versions kept; read once for migration.
export interface Follow {
  ids: string[];
  known: Record<string, Slot>;
  fresh: string[];
  hint: boolean;
}

export const kindsOf = (p: Prefs, id: string): Kind[] => COURSE_KINDS.filter((k) => p.wanted.includes(courseTopic(id, k)));

// A new course takes the switches of the last course of its slot, even one that already left, so a new book keeps the choice.
// A slot with no history starts with every notification on.
export function reconcilePrefs(p: Prefs, courses: CourseDTO[]): Prefs {
  const added = courses.filter((c) => !p.known.some(([id]) => id === c.id));
  if (added.length === 0) return p;
  let next = p;
  for (const c of added) {
    const previous = [...next.known].reverse().find(([, slot]) => slot === c.slot);
    const kinds = previous ? kindsOf(next, previous[0]) : COURSE_KINDS;
    next = { wanted: [...next.wanted, ...kinds.map((k) => courseTopic(c.id, k))], known: [...next.known, [c.id, c.slot]] };
  }
  return next;
}

// Known courses come from the old record in the order it saw them; courses it never saw go through reconcilePrefs,
// so a book that started before the update inherits from the one it replaced.
export function migratePrefs(old: { topics: string[] | null; topicCourses: string[] | null; follow: Follow | null }, courses: CourseDTO[]): Prefs | null {
  const { topics, topicCourses, follow } = old;
  if (!topics && !follow) return null;
  if (follow) {
    // The old version dropped the topics of a followed course while it was not listed, and gave it all three back on its return.
    const paused = topics && topicCourses ? follow.ids.filter((id) => !topicCourses.includes(id)) : [];
    const wanted = [...new Set([...(topics ?? topicsFor(follow.ids)), ...paused.flatMap((id) => COURSE_KINDS.map((k) => courseTopic(id, k)))])];
    return reconcilePrefs({ wanted, known: Object.entries(follow.known) }, courses);
  }
  // Before the lesson choice, every course the app had not seen yet was subscribed in full.
  const seen = topicCourses ?? [];
  const fresh = courses.filter((c) => !seen.includes(c.id));
  const known: Prefs['known'] = [
    ...seen.flatMap((id): Prefs['known'] => {
      const slot = courses.find((c) => c.id === id)?.slot;
      return slot ? [[id, slot]] : [];
    }),
    ...fresh.map((c): Prefs['known'][number] => [c.id, c.slot]),
  ];
  const added = topicsFor(fresh.map((c) => c.id)).filter((t) => t !== LIVE_OTHER_TOPIC);
  return { wanted: [...new Set([...topics!, ...added])], known };
}

const courseOf = (topic: string): string | null => topic.match(/^c-(.+)-(?:live|rec|prep)$/)?.[1] ?? null;

// Every wanted topic is subscribed again on each sync: a restored backup has a fresh FCM instance.
export function subscriptionPlan(p: Prefs, listed: string[], subscribed: string[]): { sub: string[]; unsub: string[]; wanted: string[] } {
  const wanted = p.wanted.filter((t) => {
    const id = courseOf(t);
    return id === null || listed.includes(id);
  });
  return { wanted, sub: wanted, unsub: [...new Set([...subscribed, ...topicsFor(listed)])].filter((t) => !wanted.includes(t)) };
}

export function attended(p: Prefs | null, courses: CourseDTO[]): string[] {
  const ids = courses.map((c) => c.id);
  const on = p ? ids.filter((id) => kindsOf(p, id).length > 0) : [];
  return on.length > 0 ? on : ids;
}
