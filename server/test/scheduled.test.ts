import { describe, expect, it, vi } from 'vitest';
import { dispatchScheduled } from '../src/index';

const deps = { now: new Date() } as any;
const at = (minute: number) => new Date(Date.UTC(2026, 9, 30, 12, minute));

function jobs() {
  return { live: vi.fn(async () => {}), reminders: vi.fn(async () => {}), recordings: vi.fn(async () => {}) };
}

describe('dispatchScheduled', () => {
  it('runs recording ingest on UTC minute 10', async () => {
    const j = jobs();
    await dispatchScheduled(j, deps, at(10));
    expect(j.live).toHaveBeenCalled();
    expect(j.reminders).toHaveBeenCalled();
    expect(j.recordings).toHaveBeenCalled();
  });

  it('skips recording ingest on minute 11', async () => {
    const j = jobs();
    await dispatchScheduled(j, deps, at(11));
    expect(j.live).toHaveBeenCalled();
    expect(j.reminders).toHaveBeenCalled();
    expect(j.recordings).not.toHaveBeenCalled();
  });

  it('a throwing live job does not stop the others and is logged', async () => {
    const j = jobs();
    j.live.mockRejectedValue(new Error('boom'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await dispatchScheduled(j, deps, at(20));
    expect(j.reminders).toHaveBeenCalled();
    expect(j.recordings).toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
