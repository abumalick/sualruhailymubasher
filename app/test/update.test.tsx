import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const prefs = vi.hoisted(() => new Map<string, string>());
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: prefs.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => void prefs.set(key, value),
    remove: async ({ key }: { key: string }) => void prefs.delete(key),
    keys: async () => ({ keys: [] }),
  },
}));
const device = vi.hoisted(() => ({ platform: 'android', version: '1.0.16' }));
vi.mock('@capacitor/core', async (orig) => {
  const real = (await orig()) as typeof import('@capacitor/core');
  return {
    ...real,
    Capacitor: { ...real.Capacitor, getPlatform: () => device.platform, isNativePlatform: () => device.platform !== 'web' },
  };
});
vi.mock('@capacitor/app', () => ({
  App: { getInfo: async () => ({ version: device.version, build: '16' }), addListener: async () => ({ remove: async () => {} }) },
}));
vi.mock('../src/push', () => ({ initPush: async () => {}, syncTopics: async () => {} }));
const api = vi.hoisted(() => ({ cached: null as unknown, fresh: null as unknown, online: true }));
vi.mock('../src/api', () => ({
  loadCachedState: async () => null,
  loadCachedPolicy: async () => ((api.online ? api.fresh : api.cached) as { update?: unknown } | null)?.update ?? null,
  fetchState: async () => {
    if (!api.online) throw new Error('offline');
    return { state: api.fresh, fresh: true };
  },
  fetchLessons: async () => [],
}));

import { FIXTURE_STATE } from '../src/dev/fixture-state';

const required = { android: { min: '1.0.17', latest: '1.0.17' } };

async function mount() {
  vi.resetModules();
  const { App } = await import('../src/App');
  render(<App />);
}

// The first import transforms the whole app; done once here, a busy machine can't push it past a test's wait.
beforeAll(() => import('../src/App'), 30_000);

beforeEach(() => {
  prefs.clear();
  prefs.set('onboarded', '1');
  device.platform = 'android';
  device.version = '1.0.16';
  api.online = true;
  api.cached = null;
});
afterEach(cleanup);

describe('update gate', () => {
  it('blocks the app on a version below the minimum, even when nothing else in the response is readable', async () => {
    api.fresh = { generatedAt: 'x', live: 'reshaped', courses: 42, links: null, update: required };
    await mount();
    expect(await screen.findByText('يلزم تحديث التطبيق')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'تحديث' }).getAttribute('href')).toBe(
      'https://play.google.com/store/apps/details?id=com.albadrmubasher.app',
    );
    expect(document.querySelector('.nav')).toBeNull();
  });

  it('blocks offline from the last response it kept', async () => {
    api.online = false;
    api.cached = { ...FIXTURE_STATE, update: required };
    await mount();
    expect(await screen.findByText('يلزم تحديث التطبيق')).toBeTruthy();
  });

  it('offers an update the listener can close, and keeps it closed for that version', async () => {
    api.fresh = { ...FIXTURE_STATE, update: { android: { min: null, latest: '1.0.17' } } };
    await mount();
    await screen.findByText('يتوفر تحديث للتطبيق');
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق التحديث' }));
    await waitFor(() => expect(screen.queryByText('يتوفر تحديث للتطبيق')).toBeNull());
    expect(prefs.get('update-dismissed')).toBe('1.0.17');
    cleanup();
    await mount();
    await screen.findAllByText(FIXTURE_STATE.courses[0].title);
    expect(screen.queryByText('يتوفر تحديث للتطبيق')).toBeNull();
  });

  it('never gates the web', async () => {
    device.platform = 'web';
    api.fresh = { ...FIXTURE_STATE, update: required };
    await mount();
    await screen.findAllByText(FIXTURE_STATE.courses[0].title);
    expect(screen.queryByText('يلزم تحديث التطبيق')).toBeNull();
  });
});
