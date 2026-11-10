import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => void store.set(key, value),
    remove: async ({ key }: { key: string }) => void store.delete(key),
    keys: async () => ({ keys: [...store.keys()] }),
  },
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
const fm = vi.hoisted(() => ({
  requestPermissions: vi.fn(async () => ({ receive: 'granted' })),
  checkPermissions: vi.fn(async () => ({ receive: 'prompt' })),
}));
vi.mock('@capacitor-firebase/messaging', () => ({ FirebaseMessaging: fm, Importance: { High: 4 } }));
vi.mock('../src/api', () => ({ loadCachedState: vi.fn(async () => null), fetchState: vi.fn(), fetchLessons: vi.fn(async () => []) }));

import * as api from '../src/api';
import { App } from '../src/App';
import { FIXTURE_STATE } from '../src/dev/fixture-state';

beforeEach(() => {
  store.clear();
  location.hash = '#/';
  vi.clearAllMocks();
  vi.mocked(api.fetchState).mockResolvedValue({ state: FIXTURE_STATE, fresh: true });
});
afterEach(cleanup);

async function chooseMorning() {
  render(<App />);
  fireEvent.click(await screen.findByRole('checkbox', { name: /درس الفجر/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'متابعة · درس الفجر فقط' }));
  await screen.findByRole('heading', { name: 'فعّل التنبيهات' });
}

describe('first-launch notification step', () => {
  it('stays up after the choice is saved and asks permission only on tap', async () => {
    await chooseMorning();
    expect(JSON.parse(store.get('follow')!).ids).toEqual([FIXTURE_STATE.courses[0].id]);
    expect(fm.requestPermissions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'فعّل التنبيهات' }));
    await screen.findByText('دروسك: درس الفجر فقط');
    expect(fm.requestPermissions).toHaveBeenCalledOnce();
  });

  it('«ليس الآن» goes home without asking', async () => {
    await chooseMorning();
    fireEvent.click(screen.getByRole('button', { name: 'ليس الآن' }));
    await screen.findByText('دروسك: درس الفجر فقط');
    expect(fm.requestPermissions).not.toHaveBeenCalled();
  });
});
