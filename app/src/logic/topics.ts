import { courseTopic, LIVE_OTHER_TOPIC, type PushData, type StateDTO } from '@albadr/shared';
import { bookHref } from '../ui/format';

export const COURSE_KINDS = ['live', 'rec', 'prep'] as const;

export const topicsFor = (courseIds: string[]): string[] => [
  ...courseIds.flatMap((id) => COURSE_KINDS.map((kind) => courseTopic(id, kind))),
  LIVE_OTHER_TOPIC,
];

// null: stay on the current page.
export function routeForPush(data: PushData, state: StateDTO | null): string | null {
  const hidden = !!state && !!data.courseId && !state.courses.some((c) => c.id === data.courseId);
  if (hidden) return '#/';
  const courseHref = data.courseId ? `#/course/${data.courseId}` : '#/';
  switch (data.kind) {
    case 'live':
    case 'rec':
      return courseHref;
    case 'prep': {
      const course = state?.courses.find((c) => c.id === data.courseId);
      const next = course?.next;
      return (course && next && bookHref(course, next.pdfIndex, next.startPage, true)) || courseHref;
    }
    default:
      return null;
  }
}
