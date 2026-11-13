import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ fetchState: vi.fn(), loadCachedState: vi.fn() }));
vi.mock('../src/api', () => api);
vi.mock('../src/logic/ticks', () => ({
  loadTicks: async () => ({ read: new Set(), reviewed: new Set() }),
  setTick: async () => {},
}));

import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { boot, clearLive, currentData, refresh, requestLive, watchFreshState, watchState } from '../src/store';

const cached = { ...FIXTURE_STATE, live: { ...FIXTURE_STATE.live, isLive: false } };
const live = { ...FIXTURE_STATE, live: { ...FIXTURE_STATE.live, isLive: true } };

beforeEach(() => {
  api.fetchState.mockReset();
  api.loadCachedState.mockReset();
  api.loadCachedState.mockResolvedValue(cached);
});

describe('watchFreshState', () => {
  it('skips the cached state shown at boot and reports the fetched one', async () => {
    api.fetchState.mockResolvedValue({ state: live, fresh: true });
    const fresh = vi.fn();
    const seen = vi.fn();
    const stop = watchFreshState(fresh);
    watchState(seen);
    await boot();
    expect(seen).toHaveBeenCalledWith(cached);
    expect(fresh.mock.calls).toEqual([[live]]);
    stop();
  });

  it('stays silent offline, when the fetch falls back to the cache or fails', async () => {
    const fresh = vi.fn();
    const stop = watchFreshState(fresh);
    api.fetchState.mockResolvedValueOnce({ state: cached, fresh: false });
    await refresh();
    api.fetchState.mockRejectedValueOnce(new Error('offline'));
    await refresh();
    expect(fresh).not.toHaveBeenCalled();
    stop();
  });
});

describe('live intent', () => {
  it('a requested player waits for a state fetched after the tap', async () => {
    let answer: (v: unknown) => void = () => {};
    api.fetchState.mockImplementation(() => new Promise((r) => (answer = r)));
    requestLive({ courseId: 'kitab-tawhid' });
    expect(currentData().intent).toEqual({ courseId: 'kitab-tawhid', fresh: false, failed: false });
    answer({ state: live, fresh: true });
    await refresh();
    expect(currentData().intent).toEqual({ courseId: 'kitab-tawhid', fresh: true, failed: false });
    clearLive();
    expect(currentData().intent).toBeNull();
  });

  it('marks the intent failed when the fetch fails or falls back to the cache', async () => {
    api.fetchState.mockRejectedValueOnce(new Error('offline'));
    requestLive({ courseId: null });
    await refresh();
    expect(currentData().intent).toEqual({ courseId: null, fresh: false, failed: true });
    api.fetchState.mockResolvedValueOnce({ state: cached, fresh: false });
    requestLive({ courseId: null });
    await refresh();
    expect(currentData().intent).toEqual({ courseId: null, fresh: false, failed: true });
    clearLive();
  });
});
