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

export function launchTopics(stored: StoredTopics | null, courseIds: string[]): string[] {
  if (!stored) return topicsFor(courseIds);
  const fresh = courseIds.filter((id) => !stored.courses.includes(id));
  const added = topicsFor(fresh).filter((t) => t !== LIVE_OTHER_TOPIC);
  return [...stored.topics, ...added.filter((t) => !stored.topics.includes(t))];
}

export function routeForPush(data: PushData, state: StateDTO | null): string {
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
