import { describe, expect, it } from 'vitest';
import { ADMIN_HTML } from '../src/admin-page';
import { ingestAlarming } from '../src/heartbeat';

const now = Date.parse('2026-11-15T12:00:00Z');

describe('ingestAlarming', () => {
  it('is calm for a recent ok beat, also at exactly two hours', () => {
    expect(ingestAlarming({ at: '2026-11-15T11:30:00Z', ok: true }, now)).toBe(false);
    expect(ingestAlarming({ at: '2026-11-15T10:00:00Z', ok: true }, now)).toBe(false);
  });

  it('alarms on a failed beat or one older than two hours', () => {
    expect(ingestAlarming({ at: '2026-11-15T11:59:00Z', ok: false }, now)).toBe(true);
    expect(ingestAlarming({ at: '2026-11-15T09:59:59Z', ok: true }, now)).toBe(true);
  });

  it('is the function the admin page runs', () => {
    expect(ADMIN_HTML).toContain(String(ingestAlarming));
  });
});
