import { describe, expect, it } from 'vitest';
import raw from '../wrangler.jsonc?raw';

const config = JSON.parse(raw);

describe('wrangler.jsonc', () => {
  it('deploys to the personal account under api.sualruhailymubasher.com', () => {
    expect(config.account_id).toBe('9ab550becc556ce60d4250bfdc48224c');
    expect(config.routes).toEqual([{ pattern: 'api.sualruhailymubasher.com', custom_domain: true }]);
  });

  it('binds the production D1 database by its id', () => {
    expect(config.d1_databases).toEqual([
      expect.objectContaining({ binding: 'DB', database_name: 'sualruhaily-lessons' }),
    ]);
    expect(config.d1_databases[0].database_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('runs the scheduled jobs every minute', () => {
    expect(config.triggers).toEqual({ crons: ['* * * * *'] });
  });
});
