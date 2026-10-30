import type { CourseInput, ExceptionInput, LessonPatch } from '@albadr/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getFcm, type Env } from '../index';
import { runRecordingIngest } from '../jobs/recordings';
import {
  addException,
  deleteException,
  listCourses,
  listExceptions,
  patchLesson,
  pendingTranscriptions,
  setSetting,
  upsertCourse,
} from '../repo';
import { medinaDate } from '../time';

const encoder = new TextEncoder();

async function tokenMatches(given: string, expected: string): Promise<boolean> {
  if (!expected) return false;
  const [a, b] = await Promise.all(
    [given, expected].map(async (v) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(v)))),
  );
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number): v is number => Number.isInteger(v) && (v as number) >= min;
const isString = (v: unknown): v is string => typeof v === 'string';
const isDate = (v: unknown) => isString(v) && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isTime = (v: unknown) => isString(v) && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

const KINDS = ['cancel', 'pause', 'extra', 'move'];
const LESSON_KEYS = ['startPoint', 'pdfIndex', 'startPage', 'endPoint', 'endPage'];

function parseCourse(b: unknown): CourseInput | null {
  if (!isObject(b)) return null;
  const ok =
    isString(b.title) &&
    b.title.trim() !== '' &&
    (b.slot === 'fajr' || b.slot === 'maghrib') &&
    Array.isArray(b.weekdays) &&
    b.weekdays.every((d) => isInt(d, 0) && d <= 6) &&
    isTime(b.time) &&
    isInt(b.seriesId, 0) &&
    Array.isArray(b.pdfUrls) &&
    b.pdfUrls.every(isString) &&
    typeof b.active === 'boolean';
  return ok ? (b as unknown as CourseInput) : null;
}

function parseLessonPatch(b: unknown): LessonPatch | null {
  if (!isObject(b) || Object.keys(b).some((k) => !LESSON_KEYS.includes(k))) return null;
  const ok =
    (b.startPoint === undefined || isString(b.startPoint)) &&
    (b.endPoint === undefined || isString(b.endPoint)) &&
    (b.pdfIndex === undefined || isInt(b.pdfIndex, 0)) &&
    (b.startPage === undefined || isInt(b.startPage, 1)) &&
    (b.endPage === undefined || isInt(b.endPage, 1));
  return ok ? (b as LessonPatch) : null;
}

function parseException(b: unknown): ExceptionInput | null {
  if (!isObject(b)) return null;
  const ok =
    (b.courseId === null || isString(b.courseId)) &&
    isString(b.kind) &&
    KINDS.includes(b.kind) &&
    isDate(b.dateFrom) &&
    (b.dateTo === undefined || b.dateTo === null || isDate(b.dateTo)) &&
    (b.time === undefined || b.time === null || isTime(b.time)) &&
    (b.note === undefined || isString(b.note));
  return ok ? (b as unknown as ExceptionInput) : null;
}

const readJson = (c: { req: { json: () => Promise<unknown> } }) => c.req.json().catch(() => null);

export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.use(
  '/api/admin/*',
  cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type'], allowMethods: ['GET', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'] }),
);

adminRoutes.use('/api/admin/*', async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!(await tokenMatches(given, c.env.ADMIN_TOKEN ?? '')) || given === '') {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
});

const bad = (c: { json: (b: unknown, s: 400) => Response }) => c.json({ error: 'invalid body' }, 400);

adminRoutes.get('/api/admin/courses', async (c) => c.json(await listCourses(c.env.DB)));

adminRoutes.put('/api/admin/courses/:id', async (c) => {
  const input = parseCourse(await readJson(c));
  if (!input) return bad(c);
  await upsertCourse(c.env.DB, c.req.param('id'), input);
  return c.body(null, 204);
});

adminRoutes.patch('/api/admin/lessons/:courseId/:number', async (c) => {
  const number = Number(c.req.param('number'));
  const patch = parseLessonPatch(await readJson(c));
  if (!patch || !isInt(number, 0)) return bad(c);
  const found = await patchLesson(c.env.DB, c.req.param('courseId'), number, patch);
  return found ? c.body(null, 204) : c.json({ error: 'not found' }, 404);
});

adminRoutes.get('/api/admin/exceptions', async (c) => c.json(await listExceptions(c.env.DB, medinaDate(new Date()))));

adminRoutes.post('/api/admin/exceptions', async (c) => {
  const input = parseException(await readJson(c));
  if (!input) return bad(c);
  return c.json({ id: await addException(c.env.DB, input) });
});

adminRoutes.delete('/api/admin/exceptions/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!isInt(id, 0)) return c.json({ error: 'not found' }, 404);
  return (await deleteException(c.env.DB, id)) ? c.body(null, 204) : c.json({ error: 'not found' }, 404);
});

adminRoutes.put('/api/admin/settings/live_mode', async (c) => {
  const b = await readJson(c);
  if (!isObject(b) || (b.value !== 'embed' && b.value !== 'direct')) return bad(c);
  await setSetting(c.env.DB, 'live_mode', b.value);
  return c.body(null, 204);
});

adminRoutes.get('/api/admin/pending-transcriptions', async (c) => c.json(await pendingTranscriptions(c.env.DB)));

adminRoutes.post('/api/admin/test-push', async (c) => {
  const b = await readJson(c);
  if (!isObject(b) || !isString(b.topic) || b.topic === '') return bad(c);
  try {
    await getFcm(c.env.FCM_SERVICE_ACCOUNT ?? '').sendToTopic(b.topic, {
      title: 'تجربة',
      body: 'تنبيه تجريبي من دروس البدر',
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
  return c.body(null, 204);
});

adminRoutes.post('/api/admin/run/ingest', async (c) => {
  try {
    await runRecordingIngest({
      db: c.env.DB,
      fetch,
      fcm: getFcm(c.env.FCM_SERVICE_ACCOUNT ?? ''),
      now: new Date(),
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
  return c.body(null, 204);
});
