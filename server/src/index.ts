import { Hono } from 'hono';
import { ADMIN_HTML } from './admin-page';
import { createFcm, type Fcm } from './fcm';
import { runLivePoll, type LiveDeps } from './jobs/live';
import { runRecordingIngest } from './jobs/recordings';
import { runReminders } from './jobs/reminders';
import { adminRoutes } from './routes/admin';
import { publicRoutes } from './routes/public';

export interface Env {
  DB: D1Database;
  ADMIN_TOKEN: string;
  FCM_SERVICE_ACCOUNT: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ ok: true }));
app.get('/admin', (c) => c.html(ADMIN_HTML));
app.route('/', publicRoutes);
app.route('/', adminRoutes);

export interface Jobs {
  live: (deps: LiveDeps) => Promise<void>;
  reminders: (deps: LiveDeps) => Promise<void>;
  recordings: (deps: LiveDeps) => Promise<void>;
}

const defaultJobs: Jobs = { live: runLivePoll, reminders: runReminders, recordings: runRecordingIngest };

export async function dispatchScheduled(jobs: Jobs, deps: LiveDeps, at: Date): Promise<void> {
  const run = { ...deps, now: at };
  const due: [string, (d: LiveDeps) => Promise<void>][] = [
    ['live', jobs.live],
    ['reminders', jobs.reminders],
  ];
  if (at.getUTCMinutes() % 10 === 0) due.push(['recordings', jobs.recordings]);
  await Promise.all(
    due.map(async ([name, job]) => {
      try {
        await job(run);
      } catch (e) {
        console.error(`scheduled job ${name} failed`, e);
      }
    }),
  );
}

let fcmMemo: { secret: string; fcm: Fcm } | null = null;

export function getFcm(secret: string): Fcm {
  if (fcmMemo?.secret !== secret) fcmMemo = { secret, fcm: createFcm(secret, fetch) };
  return fcmMemo.fcm;
}

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const at = new Date(event.scheduledTime);
    ctx.waitUntil(
      dispatchScheduled(defaultJobs, { db: env.DB, fetch, fcm: getFcm(env.FCM_SERVICE_ACCOUNT ?? ''), now: at }, at),
    );
  },
};
