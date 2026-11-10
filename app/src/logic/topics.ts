import { courseTopic, LIVE_OTHER_TOPIC, type PushData, type StateDTO } from '@albadr/shared';
import { bookHref } from '../ui/format';

export const COURSE_KINDS = ['live', 'rec', 'prep'] as const;

export interface StoredTopics {
  topics: string[];
  courses: string[];
}

export const topicsFor = (courseIds: string[]): string[] => [
  ...courseIds.flatMap((id) => COURSE_KINDS.map((kind) => courseTopic(id, kind))),
  LIVE_OTHER_TOPIC,
];

export function diffTopics(current: string[], wanted: string[]): { sub: string[]; unsub: string[] } {
  return {
    sub: wanted.filter((t) => !current.includes(t)),
    unsub: current.filter((t) => !wanted.includes(t)),
  };
}

const topicCourse = (topic: string): string | null => topic.match(/^c-(.+)-(?:live|rec|prep)$/)?.[1] ?? null;

// courseIds are the courses the listener follows: topics of any other course are dropped,
// and a course coming back gets its defaults again.
export function launchTopics(stored: StoredTopics | null, courseIds: string[]): string[] {
  if (!stored) return topicsFor(courseIds);
  const kept = stored.topics.filter((t) => {
    const id = topicCourse(t);
    return id === null || courseIds.includes(id);
  });
  const fresh = courseIds.filter((id) => !stored.courses.includes(id));
  const added = topicsFor(fresh).filter((t) => t !== LIVE_OTHER_TOPIC);
  return [...kept, ...added.filter((t) => !kept.includes(t))];
}

export interface SyncPlan {
  sub: string[];
  unsub: string[];
  courses: string[];
  coursesIfFailed: string[];
}

// Every wanted topic is re-subscribed (a restored backup has a fresh FCM instance); every other course topic is dropped.
// After a partial failure, dropped courses leave the stored list so they get their defaults when followed again.
export function syncPlan(stored: StoredTopics | null, allIds: string[], followed: string[]): SyncPlan {
  const ids = allIds.filter((id) => followed.includes(id));
  const wanted = launchTopics(stored, ids);
  const current = stored?.topics ?? [];
  return {
    sub: wanted,
    unsub: [...new Set([...current, ...topicsFor(allIds)])].filter((t) => !wanted.includes(t)),
    courses: ids,
    coursesIfFailed: (stored?.courses ?? []).filter((id) => ids.includes(id)),
  };
}

export function routeForPush(data: PushData, state: StateDTO | null): string {
  const hidden = !!state && !!data.courseId && !state.courses.some((c) => c.id === data.courseId);
  if (hidden) return '#/';
  const courseHref = data.courseId ? `#/course/${data.courseId}` : '#/';
  switch (data.kind) {
    case 'rec':
      return courseHref;
    case 'prep': {
      const course = state?.courses.find((c) => c.id === data.courseId);
      const next = course?.next;
      return (course && next && bookHref(course, next.pdfIndex, next.startPage, true)) || courseHref;
    }
    default:
      return '#/';
  }
}
