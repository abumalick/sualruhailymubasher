import type { Slot, StateDTO } from '@albadr/shared';
import { courseLabel, slotName } from '../ui/format';
import { LESSON_MS, nextStart } from './lesson';

export interface LessonTab {
  courseId: string;
  slot: Slot;
  label: string;
  live: boolean;
}

const slotOrder = (s: Slot) => (s === 'fajr' ? 0 : 1);

export function lessonTabs(view: StateDTO | null): LessonTab[] {
  if (!view) return [];
  const { courses, live } = view;
  return [...courses]
    .sort((a, b) => slotOrder(a.slot) - slotOrder(b.slot))
    .map((c) => ({
      courseId: c.id,
      slot: c.slot,
      label: courses.some((o) => o.id !== c.id && o.slot === c.slot) ? courseLabel(c, courses) : slotName(c.slot),
      live: live.isLive && live.courseId === c.id,
    }));
}

// attended: the lessons the listener chose; a broadcast on air opens whatever they chose.
export function defaultTab(view: StateDTO, now: Date, attended?: string[]): string | null {
  const all = lessonTabs(view);
  const mine = all.filter((t) => attended?.includes(t.courseId));
  const tabs = mine.length > 0 ? mine : all;
  if (tabs.length === 0) return null;
  const onAir = all.find((t) => t.live);
  if (onAir) return onAir.courseId;
  const nowMs = now.getTime();
  const key = (id: string) => {
    const start = nextStart(view.courses.find((c) => c.id === id)!);
    return nowMs >= start + LESSON_MS ? Infinity : start;
  };
  return tabs.reduce((best, t) => (key(t.courseId) < key(best.courseId) ? t : best)).courseId;
}
