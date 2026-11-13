import { cleanup, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateDTO } from '@albadr/shared';

const store = new Map<string, string>();
// Reads of these keys reject, the way a corrupt or locked store does; 'keys' makes Preferences.keys() reject.
const failing = new Set<string>();
const read = async (key: string) => {
  if (failing.has(key)) throw new Error(`cannot read ${key}`);
  return store.get(key) ?? null;
};
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: await read(key) }),
    set: async ({ key, value }: { key: string; value: string }) => void store.set(key, value),
    remove: async ({ key }: { key: string }) => void store.delete(key),
    keys: async () => {
      if (failing.has('keys')) throw new Error('cannot list keys');
      return { keys: [...store.keys()] };
    },
  },
}));
vi.mock('../src/api', () => ({ loadCachedState: vi.fn(), fetchState: vi.fn(), fetchLessons: vi.fn(async () => []) }));

import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { topicsFor } from '../src/logic/topics';

const [fajr, maghrib] = FIXTURE_STATE.courses;
const MON_2110 = new Date('2026-11-02T18:10:00Z');
const legacyFajrOnly = () => {
  store.set('follow', JSON.stringify({ ids: [fajr.id], known: { [fajr.id]: 'fajr', [maghrib.id]: 'maghrib' }, fresh: [], hint: false }));
  store.set('topics', JSON.stringify(topicsFor([fajr.id])));
  store.set('topic-courses', JSON.stringify([fajr.id]));
};
const tabLabels = () => [...document.querySelectorAll('.nav a')].map((a) => a.textContent);

let api: typeof import('../src/api');
let App: typeof import('../src/App').App;

beforeEach(async () => {
  vi.resetModules();
  api = await import('../src/api');
  ({ App } = await import('../src/App'));
  store.clear();
  failing.clear();
  history.replaceState(null, '', '#/');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MON_2110);
  vi.mocked(api.fetchState).mockResolvedValue({ state: FIXTURE_STATE, fresh: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('one preference record', () => {
  it('a Fajr-only listener from an older version keeps only Fajr notifications and sees both tabs', async () => {
    legacyFajrOnly();
    store.set('onboarded', '1');
    vi.mocked(api.loadCachedState).mockResolvedValue(FIXTURE_STATE);
    render(<App />);
    await waitFor(() => expect(tabLabels()).toEqual(['الفجر', 'المغرب', 'المزيد']));
    await waitFor(() => expect(store.has('prefs')).toBe(true));
    const prefs = JSON.parse(store.get('prefs')!);
    expect(prefs.wanted.filter((t: string) => t.includes(maghrib.id))).toEqual([]);
    expect(prefs.known).toEqual([[fajr.id, 'fajr'], [maghrib.id, 'maghrib']]);
    expect(store.has('follow')).toBe(false);
    expect(store.has('topic-courses')).toBe(false);
  });

  it('migration waits for the course list when nothing is cached', async () => {
    legacyFajrOnly();
    store.set('onboarded', '1');
    vi.mocked(api.loadCachedState).mockResolvedValue(null);
    let arrive: (s: { state: StateDTO; fresh: boolean }) => void = () => {};
    vi.mocked(api.fetchState).mockImplementation(() => new Promise((r) => (arrive = r)));
    render(<App />);
    await new Promise((r) => setTimeout(r, 0));
    expect(store.has('prefs')).toBe(false);
    expect(store.has('follow')).toBe(true);
    arrive({ state: FIXTURE_STATE, fresh: true });
    await waitFor(() => expect(store.has('prefs')).toBe(true));
    expect(store.has('follow')).toBe(false);
  });

  it('opens on the soonest lesson the listener attends', async () => {
    store.set('prefs', JSON.stringify({ wanted: topicsFor([maghrib.id]), known: [[fajr.id, 'fajr'], [maghrib.id, 'maghrib']] }));
    store.set('onboarded', '1');
    vi.mocked(api.loadCachedState).mockResolvedValue(FIXTURE_STATE);
    render(<App />);
    await waitFor(() => expect(location.hash).toBe(`#/course/${maghrib.id}`));
  });

  it('first launch offline waits for the course list', async () => {
    vi.mocked(api.loadCachedState).mockResolvedValue(null);
    vi.mocked(api.fetchState).mockRejectedValue(new Error('offline'));
    render(<App />);
    await screen.findByText('نحتاج اتصالًا بالإنترنت لعرض الدروس');
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeTruthy();
  });
});

describe('a storage read that fails at boot', () => {
  it('the onboarded flag unreadable: the onboarding is shown instead of a blank screen', async () => {
    failing.add('onboarded');
    vi.mocked(api.loadCachedState).mockResolvedValue(FIXTURE_STATE);
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'أيَّ الدروس تحضر؟' })).toBeTruthy();
    expect(api.fetchState).toHaveBeenCalled();
  });

  it('every read failing still shows the onboarding, from the fetched course list', async () => {
    for (const k of ['onboarded', 'prefs', 'keys', 'state']) failing.add(k);
    vi.mocked(api.loadCachedState).mockRejectedValue(new Error('cannot read state'));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'أيَّ الدروس تحضر؟' })).toBeTruthy();
    expect(await screen.findByRole('checkbox', { name: new RegExp(fajr.title) })).toBeTruthy();
  });

  it('the preference record unreadable: the lessons open and the stored record is not replaced by a migration', async () => {
    const prefs = JSON.stringify({ wanted: topicsFor([maghrib.id]), known: [[fajr.id, 'fajr'], [maghrib.id, 'maghrib']] });
    store.set('prefs', prefs);
    store.set('topics', JSON.stringify(topicsFor([fajr.id])));
    store.set('onboarded', '1');
    failing.add('prefs');
    vi.mocked(api.loadCachedState).mockResolvedValue(FIXTURE_STATE);
    render(<App />);
    await waitFor(() => expect(tabLabels()).toEqual(['الفجر', 'المغرب', 'المزيد']));
    await new Promise((r) => setTimeout(r, 0));
    expect(store.get('prefs')).toBe(prefs);
  });

  it('the ticks unreadable: the lessons still open', async () => {
    store.set('onboarded', '1');
    failing.add('keys');
    vi.mocked(api.loadCachedState).mockResolvedValue(FIXTURE_STATE);
    render(<App />);
    await waitFor(() => expect(tabLabels()).toEqual(['الفجر', 'المغرب', 'المزيد']));
  });
});
