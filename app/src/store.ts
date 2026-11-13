import { useEffect, useState } from 'preact/hooks';
import type { StateDTO } from '@albadr/shared';
import { fetchState, loadCachedState } from './api';
import { FIXTURE_STATE } from './dev/fixture-state';
import { loadFollow, saveFollow, usedBeforeChoice } from './follow';
import { filterState, followOnly, reconcile, type Follow } from './logic/follow';
import type { LiveIntent } from './logic/liveIntent';
import { loadTicks, setTick, type TickKind, type Ticks } from './logic/ticks';

export interface AppData {
  state: StateDTO | null;
  ticks: Ticks;
  error: boolean;
  fresh: boolean; // a state fetched from the server this session, not only the cached copy
  follow?: Follow | null; // undefined until loaded, null until the listener chooses
  intent?: PendingLive | null;
}

// A tapped live notification, settled by the first fetch after the tap.
export interface PendingLive extends LiveIntent {
  fresh: boolean;
  failed: boolean;
}

let data: AppData = { state: null, ticks: { read: new Set(), reviewed: new Set() }, error: false, fresh: false };
const listeners = new Set<(d: AppData) => void>();
const freshListeners = new Set<(state: StateDTO) => void>();

let returning = false;

function update(patch: Partial<AppData>) {
  const follow = patch.follow !== undefined ? patch.follow : data.follow;
  const state = patch.state !== undefined ? patch.state : data.state;
  if (follow === null && returning && state) {
    const all = followOnly(state.courses, state.courses.map((c) => c.id), true);
    patch = { ...patch, follow: all };
    void saveFollow(all);
  } else if (follow && state) {
    const next = reconcile(follow, state.courses);
    if (next !== follow) {
      patch = { ...patch, follow: next };
      void saveFollow(next);
    }
  }
  data = { ...data, ...patch };
  listeners.forEach((l) => l(data));
}

const devParam = (name: string) => (import.meta.env.DEV ? new URLSearchParams(location.search).get(name) : null);

export function nowOverride(): Date | null {
  const v = devParam('now');
  return v ? new Date(v) : null;
}

export async function boot(): Promise<void> {
  const fixture = devParam('fixture') === '1';
  const [state, ticks, follow, used] = await Promise.all([
    fixture ? FIXTURE_STATE : loadCachedState(),
    loadTicks(),
    loadFollow(),
    usedBeforeChoice(),
  ]);
  returning = !fixture && (used || ticks.read.size + ticks.reviewed.size > 0);
  update({ state, ticks, error: false, follow, fresh: fixture });
  if (!fixture) await refresh();
}

let inflight: Promise<void> | null = null;

export const touch = () => update({});

export function refresh(): Promise<void> {
  inflight ??= (async () => {
    try {
      const { state, fresh } = await fetchState();
      const intent = data.intent && { ...data.intent, ...(fresh ? { fresh: true } : { failed: true }) };
      update(fresh ? { state, error: false, fresh, intent } : { state, error: true, intent });
      if (fresh) freshListeners.forEach((l) => l(state));
    } catch {
      update({ error: true, intent: data.intent && { ...data.intent, failed: true } });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function requestLive(intent: LiveIntent): void {
  update({ intent: { ...intent, fresh: false, failed: false } });
  void refresh();
}

export const clearLive = (): void => update({ intent: null });

export async function toggleTick(kind: TickKind, courseId: string, n: number): Promise<void> {
  const key = `${courseId}:${n}`;
  const on = !data.ticks[kind].has(key);
  await setTick(kind, courseId, n, on);
  const set = new Set(data.ticks[kind]);
  if (on) set.add(key);
  else set.delete(key);
  update({ ticks: { ...data.ticks, [kind]: set } });
}

export function useAppData(): AppData {
  const [snapshot, setSnapshot] = useState(data);
  useEffect(() => {
    listeners.add(setSnapshot);
    setSnapshot(data);
    return () => void listeners.delete(setSnapshot);
  }, []);
  return snapshot;
}

export function watchData(cb: (d: AppData) => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

// Only states just fetched from the server, never the cached copy shown at boot or offline.
export function watchFreshState(cb: (state: StateDTO) => void): () => void {
  freshListeners.add(cb);
  return () => void freshListeners.delete(cb);
}

export const currentState = (): StateDTO | null => data.state;
export const currentData = (): AppData => data;

export const viewOf = (d: AppData): StateDTO | null => (d.state && d.follow ? filterState(d.state, d.follow) : null);
export const currentView = (): StateDTO | null => viewOf(data);

export async function chooseCourses(ids: string[]): Promise<void> {
  if (!data.state) return;
  const follow = followOnly(data.state.courses, ids, false, data.follow);
  await saveFollow(follow);
  update({ follow });
}

export async function dismissFollowHint(): Promise<void> {
  if (!data.follow) return;
  const follow = { ...data.follow, hint: false };
  await saveFollow(follow);
  update({ follow });
}

export function watchState(cb: (state: StateDTO | null) => void): void {
  cb(data.state);
  listeners.add((d) => cb(d.state));
}
