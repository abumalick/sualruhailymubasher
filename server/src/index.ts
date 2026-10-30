import { Hono } from 'hono';

export interface Env {
  DB: D1Database;
  ADMIN_TOKEN: string;
  FCM_SERVICE_ACCOUNT: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ ok: true }));

export default app;
