import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateDTO } from '@sualruhaily/shared';

const store = new Map<string, string>();
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => void store.set(key, value),
    remove: async ({ key }: { key: string }) => void store.delete(key),
    keys: async () => ({ keys: [...store.keys()] }),
  },
}));
const zoom = vi.hoisted(() => ({ reset: vi.fn() }));
vi.mock('../src/zoom', async (real) => ({ ...(await real<typeof import('../src/zoom')>()), resetZoom: zoom.reset }));
vi.mock('../src/api', () => ({ API_BASE: '', loadCachedState: vi.fn(), fetchState: vi.fn(), fetchLessons: vi.fn(async () => []) }));

import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { seedPrefs } from './seed';
import { NavBar } from '../src/ui/NavBar';
import { liveDTO } from './live-state';

const MON_0940 = new Date('2026-11-02T06:40:00Z');
const MON_2110 = new Date('2026-11-02T18:10:00Z');
const onAir = (courseId: string): StateDTO => ({ ...FIXTURE_STATE, live: liveDTO(courseId) });
const tabLabels = () => [...document.querySelectorAll('.nav a')].map((a) => a.textContent);
const go = (hash: string) =>
  act(() => {
    location.hash = hash;
    dispatchEvent(new HashChangeEvent('hashchange'));
  });

function follow(ids: string[]) {
  seedPrefs(store, FIXTURE_STATE.courses, ids);
}

let resolveFetch: (s: StateDTO) => void = () => {};
async function fresh() {
  vi.resetModules();
  const api = await import('../src/api');
  const { App } = await import('../src/App');
  return { api: vi.mocked(api), App };
}
async function app(cached: StateDTO | null, now = MON_0940) {
  vi.setSystemTime(now);
  const { api, App } = await fresh();
  api.loadCachedState.mockResolvedValue(cached);
  api.fetchState.mockImplementation(() => new Promise((r) => (resolveFetch = (state) => r({ state, fresh: true }))));
  return render(<App />);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  store.clear();
  follow(['tafsir-saadi', 'kitab-tawhid']);
  history.replaceState(null, '', '#/');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('App tabs', () => {
  it("#/ opens the soonest lesson's tab and replaces the entry", async () => {
    const replace = vi.spyOn(location, 'replace');
    await app(FIXTURE_STATE);
    await waitFor(() => expect(location.hash).toBe('#/course/kitab-tawhid'));
    expect(replace).toHaveBeenCalledWith('#/course/kitab-tawhid');
    replace.mockRestore();
    expect(await screen.findByRole('heading', { level: 1, name: 'درس المغرب' })).toBeTruthy();
    expect(tabLabels()).toEqual(['الفجر', 'المغرب', 'المزيد']);
    expect(document.querySelector('.nav a.on')!.textContent).toBe('المغرب');
  });

  it('#/ re-resolves once on the first fresh state', async () => {
    await app(FIXTURE_STATE);
    await waitFor(() => expect(location.hash).toBe('#/course/kitab-tawhid'));
    await act(async () => resolveFetch(onAir('tafsir-saadi')));
    await waitFor(() => expect(location.hash).toBe('#/course/tafsir-saadi'));
  });

  it('#/ does not move a listener who picked a tab before the fresh state', async () => {
    await app(FIXTURE_STATE);
    await waitFor(() => expect(location.hash).toBe('#/course/kitab-tawhid'));
    await go('#/more');
    await go('#/course/kitab-tawhid');
    await act(async () => resolveFetch(onAir('tafsir-saadi')));
    await screen.findByText('درس الفجر مباشر الآن');
    expect(location.hash).toBe('#/course/kitab-tawhid');
  });

  it('an old #/courses link lands on a lesson tab', async () => {
    history.replaceState(null, '', '#/courses');
    await app(FIXTURE_STATE, MON_2110);
    await waitFor(() => expect(location.hash).toBe('#/course/tafsir-saadi'));
  });

  it('a listener with every notification off still has both lesson tabs', async () => {
    follow([]);
    await app(FIXTURE_STATE);
    await waitFor(() => expect(location.hash).toBe('#/course/kitab-tawhid'));
    expect(tabLabels()).toEqual(['الفجر', 'المغرب', 'المزيد']);
  });

  it('nav shows only المزيد without a state, with a retry once the fetch failed', async () => {
    vi.setSystemTime(MON_0940);
    const { api, App } = await fresh();
    api.loadCachedState.mockResolvedValue(null);
    api.fetchState.mockRejectedValue(new Error('offline'));
    render(<App />);
    expect(await screen.findByRole('button', { name: 'إعادة المحاولة' })).toBeTruthy();
    expect(tabLabels()).toEqual(['المزيد']);
  });

  it('a one-lesson listener sees both tabs and opens on their own lesson', async () => {
    follow(['tafsir-saadi']);
    await app(FIXTURE_STATE);
    await waitFor(() => expect(location.hash).toBe('#/course/tafsir-saadi'));
    expect(tabLabels()).toEqual(['الفجر', 'المغرب', 'المزيد']);
  });

  it('المزيد is active on its pages', async () => {
    await app(FIXTURE_STATE);
    await waitFor(() => expect(location.hash).toBe('#/course/kitab-tawhid'));
    for (const hash of ['#/more', '#/links', '#/about']) {
      await go(hash);
      expect(document.querySelector('.nav a.on')!.textContent).toBe('المزيد');
    }
  });

  it('the missing-book page links back to the lessons', async () => {
    history.replaceState(null, '', '#/book/nope/0/1');
    await app(FIXTURE_STATE);
    fireEvent.click(await screen.findByRole('link', { name: 'الدروس' }));
    await waitFor(() => expect(location.hash).toBe('#/course/kitab-tawhid'));
  });
});

describe('NavBar', () => {
  const tabs = [
    { courseId: 'tafsir-saadi', slot: 'fajr' as const, label: 'الفجر', live: false },
    { courseId: 'kitab-tawhid', slot: 'maghrib' as const, label: 'المغرب', live: true },
  ];

  it('the tab of the lesson on air has a red dot', () => {
    render(<NavBar route={{ name: 'more' }} tabs={tabs} />);
    const links = [...document.querySelectorAll('.nav a')];
    expect(links.map((a) => !!a.querySelector('.ld'))).toEqual([false, true, false]);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['#/course/tafsir-saadi', '#/course/kitab-tawhid', '#/more']);
    expect(links.map((a) => a.getAttribute('data-slot'))).toEqual(['fajr', 'maghrib', null]);
  });

  it('the lesson tab stays active in its book', () => {
    render(<NavBar route={{ name: 'book', id: 'tafsir-saadi', pdfIndex: 0, page: 1, marker: false }} tabs={tabs} />);
    expect(document.querySelector('.nav a.on')!.textContent).toBe('الفجر');
  });
});

describe('zoom', () => {
  it('leaving the book, where the page may be pinch-zoomed, brings the page back to its normal scale', async () => {
    await app(FIXTURE_STATE, MON_2110);
    await screen.findAllByText(FIXTURE_STATE.courses[0].title);
    zoom.reset.mockClear();
    await go('#/book/tafsir-saadi/0/312?marker=1');
    await waitFor(() => expect(document.querySelector('.book')).toBeTruthy());
    expect(zoom.reset).not.toHaveBeenCalled();
    await go('#/course/tafsir-saadi');
    await waitFor(() => expect(document.querySelector('.book')).toBeNull());
    expect(zoom.reset).toHaveBeenCalledOnce();
    await go('#/more');
    expect(zoom.reset).toHaveBeenCalledOnce();
  });
});
