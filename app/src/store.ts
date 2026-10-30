import { useEffect, useState } from 'preact/hooks';
import type { StateDTO } from '@albadr/shared';
import { fetchState, loadCachedState } from './api';
import { FIXTURE_STATE } from './dev/fixture-state';
import { loadTicks, setTick, type TickKind, type Ticks } from './logic/ticks';

export interface AppData {
  state: StateDTO | null;
  ticks: Ticks;
  error: boolean;
}

let data: AppData = { state: null, ticks: { read: new Set(), reviewed: new Set() }, error: false };
const listeners = new Set<(d: AppData) => void>();

function update(patch: Partial<AppData>) {
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
  const [state, ticks] = await Promise.all([fixture ? FIXTURE_STATE : loadCachedState(), loadTicks()]);
  update({ state, ticks, error: false });
  if (!fixture) await refresh();
}

let inflight: Promise<void> | null = null;

export const touch = () => update({});

export function refresh(): Promise<void> {
  inflight ??= (async () => {
    try {
      const { state, fresh } = await fetchState();
      update({ state, error: !fresh });
    } catch {
      update({ error: true });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

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

export const currentState = (): StateDTO | null => data.state;

export function watchState(cb: (state: StateDTO | null) => void): void {
  cb(data.state);
  listeners.add((d) => cb(d.state));
}
