import { describe, expect, it } from 'vitest';
import raw from '../wrangler.jsonc?raw';

const config = JSON.parse(raw);

describe('wrangler.jsonc', () => {
  it('deploys to the personal account under api.albadrmubasher.com', () => {
    expect(config.account_id).toBe('9ab550becc556ce60d4250bfdc48224c');
    expect(config.routes).toEqual([{ pattern: 'api.albadrmubasher.com', custom_domain: true }]);
  });

  it('binds the D1 database that lives on that account', () => {
    expect(config.d1_databases).toEqual([
      expect.objectContaining({ binding: 'DB', database_id: '11ae0749-3428-4993-ba2e-16d6aea40336' }),
    ]);
  });

  it('runs the scheduled jobs every minute', () => {
    expect(config.triggers).toEqual({ crons: ['* * * * *'] });
  });
});
