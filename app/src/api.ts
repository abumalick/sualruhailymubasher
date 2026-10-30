import { Preferences } from '@capacitor/preferences';
import type { LessonDTO, StateDTO } from '@albadr/shared';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://api.albadr.h2.limited';
const STATE_KEY = 'state';

export async function loadCachedState(): Promise<StateDTO | null> {
  const { value } = await Preferences.get({ key: STATE_KEY });
  if (!value) return null;
  try {
    return JSON.parse(value) as StateDTO;
  } catch {
    return null;
  }
}

export async function fetchState(f: typeof fetch = fetch): Promise<{ state: StateDTO; fresh: boolean }> {
  try {
    const res = await f(`${API_BASE}/api/state`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`state ${res.status}`);
    const state = (await res.json()) as StateDTO;
    await Preferences.set({ key: STATE_KEY, value: JSON.stringify(state) });
    return { state, fresh: true };
  } catch (err) {
    const cached = await loadCachedState();
    if (!cached) throw err;
    return { state: cached, fresh: false };
  }
}

export async function fetchLessons(courseId: string, before?: number): Promise<LessonDTO[]> {
  const query = before === undefined ? 'limit=20' : `before=${before}&limit=20`;
  const res = await fetch(`${API_BASE}/api/courses/${encodeURIComponent(courseId)}/lessons?${query}`);
  if (!res.ok) throw new Error(`lessons ${res.status}`);
  return (await res.json()) as LessonDTO[];
}
