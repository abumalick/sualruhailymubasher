import { courseTopic, updatePolicyProblem, LIVE_OTHER_TOPIC, NOTICE_TAG, type CourseInput, type ExceptionInput, type IngestIndex, type LessonInput, type LessonPatch, type LessonUpsertResult, type SlotCancellationInput, type SlotCancellationResult } from '@sualruhaily/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Fcm } from '../fcm';
import { getFcm, type Env } from '../index';
import { sendRecordingPush, shouldPushRecording } from '../jobs/recording-push';
import {
  addCancellations,
  addException,
  ingestIndex,
  deleteException,
  listCourses,
  listExceptions,
  listSections,
  nextInSequence,
  patchLesson,
  reorderSections,
  pendingTranscriptions,
  setSetting,
  upsertCourse,
  SourceRefConflict,
  upsertLesson,
} from '../repo';
import { coursesInSlotOn } from '../schedule';
import { hijriToMedinaDate, isRecentDate, medinaDate, normalizeHijri } from '../time';

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
const isDate = (v: unknown) => {
  if (!isString(v) || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const isTime = (v: unknown) => isString(v) && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

const KINDS = ['cancel', 'pause', 'extra', 'move'];
const COURSE_ID = /^[a-z0-9-]{1,40}$/;
const LESSON_KEYS = ['startPoint', 'pdfIndex', 'startPage', 'endPoint', 'endPage', 'endPdfIndex'];

function parseCourse(b: unknown): CourseInput | null {
  if (!isObject(b)) return null;
  const ok =
    isString(b.title) &&
    b.title.trim() !== '' &&
    (b.slot === 'fajr' || b.slot === 'asr' || b.slot === 'maghrib') &&
    isString(b.place) &&
    Array.isArray(b.weekdays) &&
    b.weekdays.every((d) => isInt(d, 0) && d <= 6) &&
    isInt(b.offsetMin, 0) &&
    b.offsetMin <= 120 &&
    isInt(b.seriesId, 0) &&
    Array.isArray(b.pdfUrls) &&
    b.pdfUrls.every(isString) &&
    typeof b.active === 'boolean' &&
    (b.edition === undefined || b.edition === null || isString(b.edition)) &&
    (b.pageOffsets === undefined ||
      (Array.isArray(b.pageOffsets) && b.pageOffsets.length <= b.pdfUrls.length && b.pageOffsets.every(Number.isInteger)));
  return ok ? (b as unknown as CourseInput) : null;
}

function parseLessonPatch(b: unknown): LessonPatch | null {
  if (!isObject(b) || Object.keys(b).some((k) => !LESSON_KEYS.includes(k))) return null;
  const ok =
    (b.startPoint === undefined || isString(b.startPoint)) &&
    (b.endPoint === undefined || b.endPoint === null || isString(b.endPoint)) &&
    [b.pdfIndex, b.endPdfIndex].every((v) => v === undefined || v === null || isInt(v, 0)) &&
    [b.startPage, b.endPage].every((v) => v === undefined || v === null || isInt(v, 1));
  return ok ? (b as LessonPatch) : null;
}

function parseLessonInput(b: unknown): LessonInput | null {
  if (!isObject(b)) return null;
  const ok =
    isString(b.courseId) &&
    isString(b.section) &&
    isInt(b.sectionNumber, 1) &&
    isString(b.hijriDate) &&
    normalizeHijri(b.hijriDate) !== null &&
    isString(b.startPoint) &&
    (b.recordingUrl === null || isString(b.recordingUrl)) &&
    isString(b.sourceRef) &&
    b.sourceRef !== '' &&
    (b.notify === undefined || typeof b.notify === 'boolean');
  return ok ? (b as unknown as LessonInput) : null;
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

function parseSlotCancellation(b: unknown): (SlotCancellationInput & { date: string }) | null {
  if (!isObject(b)) return null;
  const slotOk = b.slot === 'fajr' || b.slot === 'asr' || b.slot === 'maghrib';
  const bothGiven = b.date !== undefined && b.hijriDate !== undefined;
  if (!slotOk || !isString(b.sourceRef) || b.sourceRef === '' || !isString(b.note) || bothGiven) return null;
  let date: string | null = null;
  if (isDate(b.date)) date = b.date as string;
  else if (isString(b.hijriDate)) {
    const hijri = normalizeHijri(b.hijriDate);
    date = hijri && hijriToMedinaDate(hijri);
  }
  return date ? { sourceRef: b.sourceRef, slot: b.slot as SlotCancellationInput['slot'], note: b.note, date } : null;
}

const readJson = (c: { req: { json: () => Promise<unknown> } }) => c.req.json().catch(() => null);

export const adminRoutes = new Hono<{ Bindings: Env; Variables: { fcm?: Fcm; now?: Date } }>();

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
  const id = c.req.param('id');
  const input = parseCourse(await readJson(c));
  if (!input || !COURSE_ID.test(id)) return bad(c);
  await upsertCourse(c.env.DB, id, input);
  return c.body(null, 204);
});

adminRoutes.post('/api/admin/lessons', async (c) => {
  const input = parseLessonInput(await readJson(c));
  const course = input && (await listCourses(c.env.DB)).find((k) => k.id === input.courseId);
  if (!input || !course) return bad(c);

  const hadLessonsBefore = (await c.env.DB.prepare('SELECT 1 FROM lessons WHERE course_id = ? LIMIT 1').bind(course.id).first()) !== null;
  let r;
  try {
    r = await upsertLesson(c.env.DB, input);
  } catch (e) {
    if (e instanceof SourceRefConflict) return c.json({ error: e.message }, 409);
    throw e;
  }
  const isNewestInSequence = (await nextInSequence(c.env.DB, course.id, r.number)) === null;

  let pushed = false;
  const isRecent = isRecentDate(r.heldDate, c.get('now') ?? new Date());
  if (input.notify !== false && shouldPushRecording({ hadLessonsBefore, isNewestInSequence, recordingAdded: r.recordingAdded, isRecent })) {
    try {
      const fcm = c.get('fcm') ?? getFcm(c.env.FCM_SERVICE_ACCOUNT ?? '');
      pushed = await sendRecordingPush({ db: c.env.DB, fcm }, course, {
        number: r.number,
        section: input.section,
        sectionNumber: input.sectionNumber,
      });
    } catch (e) {
      console.error('recording push failed', e);
    }
  }
  const result: LessonUpsertResult = { number: r.number, created: r.created, dateFlag: r.dateFlag, pushed };
  return c.json(result);
});

adminRoutes.patch('/api/admin/lessons/:courseId/:number', async (c) => {
  const number = Number(c.req.param('number'));
  const patch = parseLessonPatch(await readJson(c));
  if (!patch || !isInt(number, 0)) return bad(c);
  const found = await patchLesson(c.env.DB, c.req.param('courseId'), number, patch);
  return found ? c.body(null, 204) : c.json({ error: 'not found' }, 404);
});

adminRoutes.get('/api/admin/sections/:courseId', async (c) => c.json(await listSections(c.env.DB, c.req.param('courseId'))));

adminRoutes.put('/api/admin/sections/:courseId', async (c) => {
  const b = await readJson(c);
  if (!isObject(b) || !Array.isArray(b.order) || !b.order.every(isString)) return bad(c);
  return (await reorderSections(c.env.DB, c.req.param('courseId'), b.order)) ? c.body(null, 204) : bad(c);
});

adminRoutes.get('/api/admin/exceptions', async (c) => c.json(await listExceptions(c.env.DB, medinaDate(new Date()))));

adminRoutes.post('/api/admin/exceptions', async (c) => {
  const input = parseException(await readJson(c));
  if (!input) return bad(c);
  if (input.courseId !== null && !(await listCourses(c.env.DB)).some((course) => course.id === input.courseId)) {
    return bad(c);
  }
  return c.json({ id: await addException(c.env.DB, input) });
});

adminRoutes.post('/api/admin/slot-cancellations', async (c) => {
  const input = parseSlotCancellation(await readJson(c));
  if (!input) return bad(c);
  const courseIds = coursesInSlotOn(await listCourses(c.env.DB), input.slot, input.date).map((k) => k.id);
  const created = await addCancellations(c.env.DB, courseIds, input.date, input.note, input.sourceRef);
  const result: SlotCancellationResult = { date: input.date, courseIds, created };
  return c.json(result);
});

adminRoutes.get('/api/admin/ingest-index', async (c) => {
  const index: IngestIndex = await ingestIndex(c.env.DB);
  return c.json(index);
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

// {} turns every update notice off.
adminRoutes.put('/api/admin/settings/app_update', async (c) => {
  const b = await readJson(c);
  const problem = updatePolicyProblem(b);
  if (problem) return c.json({ error: problem }, 400);
  await setSetting(c.env.DB, 'app_update', JSON.stringify(b));
  return c.body(null, 204);
});

adminRoutes.get('/api/admin/pending-transcriptions', async (c) => c.json(await pendingTranscriptions(c.env.DB)));

adminRoutes.post('/api/admin/test-push', async (c) => {
  const b = await readJson(c);
  if (!isObject(b) || !isString(b.topic)) return bad(c);
  const known = (await listCourses(c.env.DB)).flatMap((course) =>
    (['live', 'rec', 'prep'] as const).map((kind) => courseTopic(course.id, kind)),
  );
  if (b.topic !== LIVE_OTHER_TOPIC && !known.includes(b.topic)) return bad(c);
  try {
    await getFcm(c.env.FCM_SERVICE_ACCOUNT ?? '').sendToTopic(b.topic, {
      title: 'تجربة',
      body: 'تنبيه تجريبي من دروس سليمان الرحيلي',
      tag: NOTICE_TAG,
      ttlSec: 3600,
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
  return c.body(null, 204);
});
