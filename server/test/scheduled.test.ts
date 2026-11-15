import { describe, expect, it, vi } from 'vitest';
import { dispatchScheduled } from '../src/index';

const deps = { now: new Date() } as any;
const at = (minute: number) => new Date(Date.UTC(2026, 9, 30, 12, minute));

function jobs() {
  return { live: vi.fn(async () => {}), reminders: vi.fn(async () => {}) };
}

describe('dispatchScheduled', () => {
  it('runs the live poll and reminders every minute', async () => {
    for (const minute of [10, 11]) {
      const j = jobs();
      await dispatchScheduled(j, deps, at(minute));
      expect(j.live).toHaveBeenCalled();
      expect(j.reminders).toHaveBeenCalled();
    }
  });

  it('a throwing live job does not stop the others and is logged', async () => {
    const j = jobs();
    j.live.mockRejectedValue(new Error('boom'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await dispatchScheduled(j, deps, at(20));
    expect(j.reminders).toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
