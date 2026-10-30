import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('worker', () => {
  it('GET /api/health returns ok', async () => {
    const res = await exports.default.fetch('http://example.com/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('applies migrations and seeds two courses', async () => {
    const row = await env.DB.prepare('SELECT count(*) AS n FROM courses').first<{ n: number }>();
    expect(row?.n).toBe(2);
  });
});
