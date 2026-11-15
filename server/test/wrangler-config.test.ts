import { describe, expect, it } from 'vitest';
import raw from '../wrangler.jsonc?raw';

const config = JSON.parse(raw);

describe('wrangler.jsonc', () => {
  it('deploys to the personal account under api.sualruhailymubasher.com', () => {
    expect(config.account_id).toBe('9ab550becc556ce60d4250bfdc48224c');
    expect(config.routes).toEqual([{ pattern: 'api.sualruhailymubasher.com', custom_domain: true }]);
  });

  it('binds the D1 database (the real id replaces the placeholder at provisioning)', () => {
    expect(config.d1_databases).toEqual([
      expect.objectContaining({ binding: 'DB', database_id: 'TBD-task-6' }),
    ]);
  });

  it('runs the scheduled jobs every minute', () => {
    expect(config.triggers).toEqual({ crons: ['* * * * *'] });
  });
});
