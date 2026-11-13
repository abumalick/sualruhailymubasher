import { courseTopic, LIVE_OTHER_TOPIC, type CourseDTO, type LessonDTO, type LiveDTO, type NextPassageDTO } from '@albadr/shared';
import { attended, kindsOf, type Kind, type Prefs } from './prefs';
import { COURSE_KINDS, topicsFor } from './topics';
import { courseLabel, REMINDER, slotName } from '../ui/format';

export type Step = 'app' | 'live' | 'rec' | 'prep';
export const STEPS: Step[] = ['app', 'live', 'rec', 'prep'];

// picked: the lessons the listener attends; wanted: every switch, kept for unticked lessons until the end.
export interface Draft {
  picked: string[];
  wanted: string[];
}

export type Card =
  | { course: CourseDTO; kind: 'live' }
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

// The topics a step's single switch controls: that notification for every ticked lesson; other broadcasts follow the live one.
export function stepTopics(step: Step, picked: CourseDTO[]): { topic: string; courseId: string | null }[] {
  const kind = STEP_KIND[step];
  if (!kind) return [];
  const rows = picked.map((c) => ({ topic: courseTopic(c.id, kind), courseId: c.id as string | null }));
  return kind === 'live' ? [...rows, { topic: LIVE_OTHER_TOPIC, courseId: null }] : rows;
}

export const hasSwitch = (step: Step, picked: CourseDTO[]): boolean => stepTopics(step, picked).length > 0;

// Reads on when any ticked lesson has it on, so a mixed record from the Notifications screen is kept until the switch is tapped.
// Other broadcasts only decide it when no lesson is listed, the one case where the live switch controls nothing else.
export function stepOn(step: Step, d: Draft, picked: CourseDTO[]): boolean {
  const rows = stepTopics(step, picked);
  const read = picked.length > 0 ? rows.filter((r) => r.courseId !== null) : rows;
  return read.some((r) => d.wanted.includes(r.topic));
}

export function stepHint(step: Step, picked: CourseDTO[], courses: CourseDTO[]): string {
  if (step === 'app') return '';
  if (step !== 'prep') return picked.map((c) => courseLabel(c, courses)).join(' و');
  if (picked.length === 1) return REMINDER[picked[0].slot];
  const sharedSlot = new Set(picked.map((c) => c.slot)).size < picked.length;
  return picked.map((c) => `${sharedSlot ? courseLabel(c, courses) : slotName(c.slot)}: ${REMINDER[c.slot]}`).join('\n');
}

export function setStep(d: Draft, step: Step, picked: CourseDTO[], on: boolean): Draft {
  const topics = stepTopics(step, picked).map((r) => r.topic);
  const rest = d.wanted.filter((t) => !topics.includes(t));
  return { ...d, wanted: on ? [...rest, ...topics] : rest };
}

export function cardFor(step: Step, picked: CourseDTO[], live: LiveDTO): Card | null {
  if (step === 'live') {
    const course = (live.isLive && picked.find((c) => c.id === live.courseId)) || picked[0];
    return course ? { course, kind: 'live' } : null;
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
  !asked && permission.startsWith('prompt') && stepOn(step, d, picked);

export function finalPrefs(d: Draft, courses: CourseDTO[], prev: Prefs | null): Prefs {
  const dropped = courses.filter((c) => !d.picked.includes(c.id)).flatMap((c) => COURSE_KINDS.map((k) => courseTopic(c.id, k)));
  const known = [...(prev?.known ?? [])];
  for (const c of courses) if (!known.some(([id]) => id === c.id)) known.push([c.id, c.slot]);
  return { wanted: d.wanted.filter((t) => !dropped.includes(t)), known };
}
