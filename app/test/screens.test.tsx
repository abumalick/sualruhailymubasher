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
vi.mock('../src/api', () => ({ loadCachedState: vi.fn(), fetchState: vi.fn(), fetchLessons: vi.fn() }));

import * as api from '../src/api';
import { App } from '../src/App';
import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { seedPrefs } from './seed';

const MON_2110 = new Date('2026-11-02T18:10:00Z');

beforeEach(() => store.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(api.fetchLessons).mockReset();
});

describe('App boot', () => {
  it('renders the cached state, shows the refresh error, and saves the read tick when tapped', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(MON_2110);
    seedPrefs(store, FIXTURE_STATE.courses);
    vi.mocked(api.loadCachedState).mockResolvedValue(FIXTURE_STATE);
    vi.mocked(api.fetchState).mockRejectedValue(new Error('offline'));
    render(<App />);
    const read = await screen.findByRole('button', { name: 'قرأتُه' });
    expect(await screen.findByText('تعذّر التحديث')).toBeTruthy();
    fireEvent.click(read);
    await waitFor(() => expect(store.get('read:kitab-tawhid:444')).toBe('1'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'قرأتُه' }).getAttribute('aria-pressed')).toBe('true'));
  });
});
