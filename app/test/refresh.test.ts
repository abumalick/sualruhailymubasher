import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = vi.hoisted(() => new Map<string, (e?: unknown) => void>());
const removed = vi.hoisted(() => ({ n: 0 }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } }));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: async (name: string, cb: (e?: unknown) => void) => {
      handlers.set(name, cb);
      return { remove: async () => void removed.n++ };
    },
  },
}));
const fetchState = vi.hoisted(() => vi.fn());
vi.mock('../src/api', () => ({ fetchState, loadCachedState: async () => null }));

import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { startRefreshLoop } from '../src/refresh';

beforeEach(() => {
  vi.useFakeTimers();
  handlers.clear();
  removed.n = 0;
  fetchState.mockReset();
  fetchState.mockResolvedValue({ state: FIXTURE_STATE, fresh: true });
});
afterEach(() => vi.useRealTimers());

describe('refresh loop', () => {
  it('refreshes once when the app resumes', async () => {
    await startRefreshLoop();
    handlers.get('resume')!();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchState).toHaveBeenCalledTimes(1);
  });

  it('resume and appStateChange firing together fetch once', async () => {
    await startRefreshLoop();
    handlers.get('appStateChange')!({ isActive: true });
    handlers.get('resume')!();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchState).toHaveBeenCalledTimes(1);
  });

  it('refreshes every 60 s while in the foreground', async () => {
    await startRefreshLoop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchState).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchState).toHaveBeenCalledTimes(2);
  });

  it('stops the interval in the background and restarts on resume', async () => {
    await startRefreshLoop();
    handlers.get('appStateChange')!({ isActive: false });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(fetchState).not.toHaveBeenCalled();
    handlers.get('resume')!();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchState).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchState).toHaveBeenCalledTimes(2);
  });

  it('keeps ticking after a failed fetch', async () => {
    fetchState.mockRejectedValue(new Error('offline'));
    await startRefreshLoop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchState).toHaveBeenCalledTimes(2);
  });

  it('stop removes the listeners and the interval', async () => {
    const stop = await startRefreshLoop();
    await stop();
    expect(removed.n).toBe(2);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchState).not.toHaveBeenCalled();
  });
});

describe('clock re-render', () => {
  it('notifies subscribers on every tick even when the fetch never settles or fails', async () => {
    const { watchData } = await import('../src/store');
    fetchState.mockReturnValue(new Promise(() => {}));
    const seen = vi.fn();
    const off = watchData(seen);
    await startRefreshLoop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(seen).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(seen).toHaveBeenCalledTimes(2);
    off();
  });
});
