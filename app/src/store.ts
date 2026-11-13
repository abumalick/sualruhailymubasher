import { useEffect, useState } from 'preact/hooks';
import type { StateDTO } from '@albadr/shared';
import { fetchState, loadCachedState } from './api';
import { FIXTURE_STATE } from './dev/fixture-state';
import { migratePrefs, reconcilePrefs, type Prefs } from './logic/prefs';
import { dropLegacy, loadLegacy, loadOnboarded, loadPrefs, saveOnboarded, savePrefs, type Legacy } from './prefs';
import type { LiveIntent } from './logic/liveIntent';
import { loadTicks, setTick, type TickKind, type Ticks } from './logic/ticks';

export interface AppData {
  state: StateDTO | null;
  ticks: Ticks;
  error: boolean;
  fresh: boolean; // a state fetched from the server this session, not only the cached copy
  prefs?: Prefs | null; // undefined until loaded, null until the listener chooses
  onboarded?: boolean; // undefined until loaded
  intent?: PendingLive | null;
  tapped?: boolean; // a notification was tapped this session: it goes first, the onboarding waits for the next launch
}

// A tapped live notification, settled by the first fetch after the tap.
export interface PendingLive extends LiveIntent {
  fresh: boolean;
  failed: boolean;
}

let data: AppData = { state: null, ticks: { read: new Set(), reviewed: new Set() }, error: false, fresh: false };
const listeners = new Set<(d: AppData) => void>();
const freshListeners = new Set<(state: StateDTO) => void>();

// What an older version stored, until the course list is known to migrate it.
let legacy: Legacy | null = null;

function update(patch: Partial<AppData>) {
  const prefs = patch.prefs !== undefined ? patch.prefs : data.prefs;
  const state = patch.state !== undefined ? patch.state : data.state;
  if (prefs === null && legacy && state) {
    const migrated = migratePrefs(legacy, state.courses);
    legacy = null;
    if (migrated) {
      patch = { ...patch, prefs: migrated };
      void savePrefs(migrated).then(dropLegacy);
    }
  } else if (prefs && state) {
    const next = reconcilePrefs(prefs, state.courses);
    if (next !== prefs) {
      patch = { ...patch, prefs: next };
      void savePrefs(next);
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
  const before = freshFetches;
  const fixture = devParam('fixture') === '1';
  // A read that fails falls back on its own, so the app still opens: without the onboarded flag or the preference record,
  // on the onboarding.
  let prefsUnread = false;
  const [state, ticks, prefs, onboarded] = await Promise.all([
    fixture ? FIXTURE_STATE : loadCachedState().catch(() => null),
    loadTicks().catch((): Ticks => ({ read: new Set(), reviewed: new Set() })),
    loadPrefs().catch(() => {
      prefsUnread = true;
      return null;
    }),
    loadOnboarded().catch(() => false),
  ]);
  // A record that could not be read may still exist: migrating the older one would overwrite it.
  legacy = prefs || prefsUnread || fixture ? null : await loadLegacy().catch(() => null);
  // A live notification's fetch can land while the cache is still being read: keep its newer state.
  // Without its preference record the app can't show the listener's choices: they make them again in the onboarding.
  const shown = onboarded && !prefsUnread;
  update(freshFetches !== before ? { ticks, prefs, onboarded: shown } : { state, ticks, error: false, prefs, onboarded: shown, fresh: fixture });
  if (!fixture) await refresh();
}

let inflight: Promise<void> | null = null;
let freshFetches = 0;

export const touch = () => update({});

export function refresh(): Promise<void> {
  inflight ??= (async () => {
    try {
      const { state, fresh } = await fetchState();
      const intent = data.intent && { ...data.intent, ...(fresh ? { fresh: true } : { failed: true }) };
      if (fresh) freshFetches++;
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

export const markTapped = (): void => update({ tapped: true });

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

export async function setWanted(topic: string, on: boolean): Promise<void> {
  const prefs = data.prefs ?? { wanted: [], known: (data.state?.courses ?? []).map((c): Prefs['known'][number] => [c.id, c.slot]) };
  const wanted = on ? [...new Set([...prefs.wanted, topic])] : prefs.wanted.filter((t) => t !== topic);
  const next = { ...prefs, wanted };
  update({ prefs: next });
  await savePrefs(next);
}

export async function finishOnboarding(prefs: Prefs): Promise<void> {
  await savePrefs(prefs);
  await saveOnboarded();
  update({ prefs, onboarded: true });
}

export function watchState(cb: (state: StateDTO | null) => void): void {
  cb(data.state);
  listeners.add((d) => cb(d.state));
}
