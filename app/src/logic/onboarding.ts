import { courseTopic, LIVE_OTHER_TOPIC, type CourseDTO, type LessonDTO, type LiveDTO, type NextPassageDTO } from '@albadr/shared';
import { attended, kindsOf, type Kind, type Prefs } from './prefs';
import { COURSE_KINDS, topicsFor } from './topics';

export type Step = 'app' | 'live' | 'rec' | 'prep';
export const STEPS: Step[] = ['app', 'live', 'rec', 'prep'];

// picked: the lessons the listener attends; wanted: every switch, kept for unticked lessons until the end.
export interface Draft {
  picked: string[];
  wanted: string[];
}

export type Card =
  | { course: CourseDTO; kind: 'live' }
  | { course: CourseDTO; kind: 'preview'; number: number }
  | { course: CourseDTO; kind: 'recording'; lesson: LessonDTO }
  | { course: CourseDTO; kind: 'next'; next: NextPassageDTO };

const slotOrder = (c: CourseDTO) => (c.slot === 'fajr' ? 0 : 1);

export function initialDraft(p: Prefs | null, courses: CourseDTO[]): Draft {
  return { picked: attended(p, courses), wanted: p ? p.wanted : topicsFor(courses.map((c) => c.id)) };
}

export function pick(d: Draft, id: string, on: boolean): Draft {
  if (!on) return { ...d, picked: d.picked.filter((x) => x !== id) };
  const silent = kindsOf({ wanted: d.wanted, known: [] }, id).length === 0;
  return {
    picked: d.picked.includes(id) ? d.picked : [...d.picked, id],
    wanted: silent ? [...d.wanted, ...COURSE_KINDS.map((k) => courseTopic(id, k))] : d.wanted,
  };
}

export const pickedCourses = (d: Draft, courses: CourseDTO[]): CourseDTO[] =>
  courses.filter((c) => d.picked.includes(c.id)).sort((a, b) => slotOrder(a) - slotOrder(b));

const STEP_KIND: Partial<Record<Step, Kind>> = { live: 'live', rec: 'rec', prep: 'prep' };

export function stepTopics(step: Step, picked: CourseDTO[]): { topic: string; courseId: string | null }[] {
  const kind = STEP_KIND[step];
  if (!kind) return [];
  const rows = picked.map((c) => ({ topic: courseTopic(c.id, kind), courseId: c.id as string | null }));
  return kind === 'live' ? [...rows, { topic: LIVE_OTHER_TOPIC, courseId: null }] : rows;
}

export function cardFor(step: Step, picked: CourseDTO[], live: LiveDTO): Card | null {
  if (step === 'live') {
    const onAir = live.isLive ? picked.find((c) => c.id === live.courseId) : undefined;
    if (onAir) return { course: onAir, kind: 'live' };
    const first = picked[0];
    if (!first) return null;
    return { course: first, kind: 'preview', number: first.next?.number ?? (first.latest[0]?.number ?? 0) + 1 };
  }
  if (step === 'rec') {
    const course = picked.find((c) => c.latest[0]?.recordingUrl);
    return course ? { course, kind: 'recording', lesson: course.latest[0] } : null;
  }
  if (step === 'prep') {
    const course = picked.find((c) => c.next);
    return course ? { course, kind: 'next', next: course.next! } : null;
  }
  return null;
}

export const asksPermission = (step: Step, d: Draft, picked: CourseDTO[], asked: boolean, permission: string): boolean =>
  !asked && permission.startsWith('prompt') && stepTopics(step, picked).some((r) => d.wanted.includes(r.topic));

export function finalPrefs(d: Draft, courses: CourseDTO[], prev: Prefs | null): Prefs {
  const dropped = courses.filter((c) => !d.picked.includes(c.id)).flatMap((c) => COURSE_KINDS.map((k) => courseTopic(c.id, k)));
  const known = [...(prev?.known ?? [])];
  for (const c of courses) if (!known.some(([id]) => id === c.id)) known.push([c.id, c.slot]);
  return { wanted: d.wanted.filter((t) => !dropped.includes(t)), known };
}
