import type { CourseDTO, Slot, StateDTO } from '@albadr/shared';
import { slotName } from '../ui/format';

export function parseFollow(value: string | null): Follow | null {
  if (!value) return null;
  try {
    const f = JSON.parse(value) as Follow;
    return Array.isArray(f?.ids) && Array.isArray(f.fresh) && typeof f.known === 'object' && f.known !== null ? f : null;
  } catch {
    return null;
  }
}

export interface Follow {
  ids: string[];
  known: Record<string, Slot>;
  fresh: string[];
  hint: boolean;
}

// Followed courses missing from the list (a break, a hidden course) stay followed for when they come back.
export const followOnly = (courses: CourseDTO[], ids: string[], hint = false, prev?: Follow | null): Follow => ({
  ids: [
    ...courses.filter((c) => ids.includes(c.id)).map((c) => c.id),
    ...(prev?.ids ?? []).filter((id) => !courses.some((c) => c.id === id)),
  ],
  known: { ...prev?.known, ...Object.fromEntries(courses.map((c) => [c.id, c.slot])) },
  fresh: [],
  hint,
});

// A course that appears later is followed only when the listener already follows its slot,
// so a book change keeps an evening listener on the evening course without adding it for a morning-only one.
export function reconcile(f: Follow, courses: CourseDTO[]): Follow {
  const added = courses.filter((c) => !(c.id in f.known));
  if (added.length === 0) return f;
  const slots = new Set(f.ids.map((id) => f.known[id]));
  return {
    ids: [...f.ids, ...added.filter((c) => slots.has(c.slot)).map((c) => c.id)],
    known: { ...f.known, ...Object.fromEntries(added.map((c) => [c.id, c.slot])) },
    fresh: [...f.fresh, ...added.filter((c) => !slots.has(c.slot)).map((c) => c.id)],
    hint: f.hint,
  };
}

export const unfollowed = (courseId: string | null | undefined, f: Follow): boolean => !!courseId && !f.ids.includes(courseId);

export const followsNone = (state: StateDTO, f: Follow) => state.courses.length > 0 && !state.courses.some((c) => f.ids.includes(c.id));

export function filterState(state: StateDTO, f: Follow): StateDTO {
  const courses = state.courses.filter((c) => f.ids.includes(c.id));
  const { live } = state;
  const hidden = live.courseId !== null && state.courses.some((c) => c.id === live.courseId) && !f.ids.includes(live.courseId);
  return { ...state, courses, live: hidden ? { ...live, isLive: false } : live };
}

export const isFiltered = (state: StateDTO, f: Follow) => state.courses.some((c) => !f.ids.includes(c.id));

export function courseLabel(c: CourseDTO, all: CourseDTO[]): string {
  const shared = all.some((o) => o.id !== c.id && o.slot === c.slot);
  return shared ? c.title : `درس ${slotName(c.slot)}`;
}

export function summary(all: CourseDTO[], ids: string[]): string {
  const picked = all.filter((c) => ids.includes(c.id));
  if (picked.length === 0) return '';
  if (picked.length === all.length) {
    if (all.length === 1) return courseLabel(all[0], all);
    return all.length === 2 ? 'الدرسان كلاهما' : 'كل الدروس';
  }
  const names = picked.map((c) => courseLabel(c, all)).join(' و');
  return picked.length === 1 ? `${names} فقط` : names;
}

export type Notice =
  | { kind: 'hint' }
  | { kind: 'none-listed' }
  | { kind: 'fresh'; course: CourseDTO }
  | { kind: 'followed'; summary: string; hidden: string | null }
  | null;

export function noticeFor(state: StateDTO, f: Follow, always: boolean): Notice {
  const all = state.courses;
  if (f.hint) return { kind: 'hint' };
  if (followsNone(state, f)) return { kind: 'none-listed' };
  const fresh = all.find((c) => f.fresh.includes(c.id));
  if (fresh) return { kind: 'fresh', course: fresh };
  const filtered = isFiltered(state, f);
  if (!filtered && !always) return null;
  const hidden = all.filter((c) => !f.ids.includes(c.id)).map((c) => courseLabel(c, all));
  return { kind: 'followed', summary: summary(all, f.ids), hidden: always && filtered ? hidden.join(' و') : null };
}
