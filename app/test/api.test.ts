import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => void store.set(key, value),
  },
}));

import { fetchLessons, fetchState, loadCachedState } from '../src/api';
import { FIXTURE_STATE } from '../src/dev/fixture-state';

const ok = (body: unknown) => async () => new Response(JSON.stringify(body), { status: 200 });

beforeEach(() => store.clear());

describe('fetchState', () => {
  it('stores a successful response and returns it fresh', async () => {
    const f = vi.fn((..._: unknown[]) => ok(FIXTURE_STATE)());
    const r = await fetchState(f as unknown as typeof fetch);
    expect(r).toEqual({ state: FIXTURE_STATE, fresh: true });
    expect(await loadCachedState()).toEqual(FIXTURE_STATE);
    expect(f.mock.calls[0][0]).toMatch(/\/api\/state$/);
    expect(f.mock.calls[0][1]).toMatchObject({ cache: 'no-store' });
    expect((f.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it('ignores a cached state of another shape', async () => {
    store.set('state', JSON.stringify({ generatedAt: 'x', courses: {} }));
    expect(await loadCachedState()).toBeNull();
  });

  it('falls back to the cache when the request rejects', async () => {
    store.set('state', JSON.stringify(FIXTURE_STATE));
    const r = await fetchState((async () => { throw new TypeError('offline'); }) as typeof fetch);
    expect(r).toEqual({ state: FIXTURE_STATE, fresh: false });
  });

  it('falls back to the cache on a non-OK response', async () => {
    store.set('state', JSON.stringify(FIXTURE_STATE));
    const r = await fetchState((async () => new Response('x', { status: 503 })) as typeof fetch);
    expect(r.fresh).toBe(false);
    expect(store.get('state')).toBe(JSON.stringify(FIXTURE_STATE));
  });

  it('throws when failing with no cache', async () => {
    await expect(fetchState((async () => { throw new TypeError('offline'); }) as typeof fetch)).rejects.toThrow();
  });

  it('loadCachedState returns null when empty or corrupt', async () => {
    expect(await loadCachedState()).toBeNull();
    store.set('state', '{oops');
    expect(await loadCachedState()).toBeNull();
  });
});

describe('fetchLessons', () => {
  it('requests the page before a number', async () => {
    const f = vi.fn((..._: unknown[]) => ok([])());
    vi.stubGlobal('fetch', f);
    await fetchLessons('tafsir-saadi', 440);
    expect(f.mock.calls[0][0]).toMatch(/\/api\/courses\/tafsir-saadi\/lessons\?before=440&limit=20$/);
    await fetchLessons('tafsir-saadi');
    expect(f.mock.calls[1][0]).toMatch(/\/api\/courses\/tafsir-saadi\/lessons\?limit=20$/);
    vi.unstubAllGlobals();
  });

  it('calls the production API host when no VITE_API_BASE is set', async () => {
    const f = vi.fn((..._: unknown[]) => ok([])());
    vi.stubGlobal('fetch', f);
    await fetchLessons('kitab-tawhid');
    expect(f.mock.calls[0][0]).toBe('https://api.albadrmubasher.com/api/courses/kitab-tawhid/lessons?limit=20');
    const g = vi.fn((..._: unknown[]) => ok(FIXTURE_STATE)());
    await fetchState(g as unknown as typeof fetch);
    expect(g.mock.calls[0][0]).toBe('https://api.albadrmubasher.com/api/state');
    vi.unstubAllGlobals();
  });

  it('throws on a non-OK response', async () => {
    vi.stubGlobal('fetch', async () => new Response('x', { status: 500 }));
    await expect(fetchLessons('a')).rejects.toThrow();
    vi.unstubAllGlobals();
  });
});

describe('FIXTURE_STATE', () => {
  it('has the two courses', () => {
    expect(FIXTURE_STATE.courses.map((c) => c.id)).toEqual(['tafsir-saadi', 'kitab-tawhid']);
    expect(FIXTURE_STATE.courses[0].latest[0].number).toBe(443);
    expect(FIXTURE_STATE.courses[1].latest[0].number).toBe(2);
  });
});
