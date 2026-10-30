import type { D1Migration } from '@cloudflare/vitest-plugin';

declare global {
  namespace Cloudflare {
    interface GlobalProps {
      mainModule: typeof import('./src/index');
    }
    interface Env {
      DB: D1Database;
      ADMIN_TOKEN: string;
      FCM_SERVICE_ACCOUNT: string;
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
