import { parseUpdatePolicy, type CourseDTO, type StateDTO } from '@sualruhaily/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from '../index';
import { nextPassage } from '../estimate';
import { servePdf } from '../pdf';
import {
  heldSinceLatest,
  getLive,
  getSetting,
  latestLessons,
  lessonsBefore,
  listCourses,
  listExceptions,
} from '../repo';
import { lessonTime, nextLessonDate } from '../schedule';
import { addDays, medinaDate } from '../time';

const EMBED_URL = 'https://sualruhaily.mixlr.com/embed';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const LINKS = [
  { title: 'الموقع الرسمي', url: 'https://sualruhaily.com' },
  { title: 'قناة التلغرام', url: 'https://t.me/Sulalruhaily' },
  { title: 'يوتيوب', url: 'https://www.youtube.com/@sualruhaily' },
  { title: 'البث المباشر', url: 'https://sualruhaily.mixlr.com' },
];

const positiveInt = (raw: string | undefined) => {
  const n = Number(raw);
  return raw !== undefined && Number.isInteger(n) && n > 0 ? n : null;
};

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const publicRoutes = new Hono<{ Bindings: Env }>();

publicRoutes.use('/api/state', cors({ origin: '*' }));
publicRoutes.use('/api/courses/*', cors({ origin: '*' }));

publicRoutes.get('/api/state', async (c) => {
  const db = c.env.DB;
  const now = new Date();
  const [courses, live, mode, appUpdate, exceptions] = await Promise.all([
    listCourses(db, { activeOnly: true }),
    getLive(db),
    getSetting(db, 'live_mode'),
    getSetting(db, 'app_update'),
    listExceptions(db, medinaDate(now)),
  ]);
  const direct = mode === 'direct';

  const dtos: CourseDTO[] = await Promise.all(
    courses.map(async (course) => {
      const latest = await latestLessons(db, course.id, 5);
      const mine = exceptions.filter((e) => e.courseId === null || e.courseId === course.id);
      const next = nextLessonDate(course, mine, now);
      const unpublished = await heldSinceLatest(db, course.id, next?.date ?? addDays(medinaDate(now), 1), now);
      return {
        id: course.id,
        title: course.title,
        lessonWord: course.lessonWord,
        slot: course.slot,
        place: course.place,
        weekdays: course.weekdays,
        time: next?.time ?? lessonTime(course, medinaDate(now)),
        pdfUrls: course.pdfUrls,
        edition: course.edition,
        pageOffsets: course.pageOffsets,
        latest,
        unpublished,
        next: next && nextPassage(course, latest, next, unpublished),
        exceptions: mine,
      };
    }),
  );

  const state: StateDTO = {
    generatedAt: now.toISOString(),
    live: {
      isLive: live.isLive,
      mode: direct ? 'direct' : 'embed',
      embedUrl: EMBED_URL,
      streamUrl: direct && live.isLive ? live.streamUrl : null,
      courseId: live.courseId,
      startedAt: live.startedAt,
    },
    courses: dtos,
    links: LINKS,
  };
  const update = appUpdate === null ? null : parseUpdatePolicy(parseJson(appUpdate));
  if (update) state.update = update;
  c.header('Cache-Control', 'public, max-age=15');
  return c.json(state);
});

publicRoutes.get('/api/courses/:id/lessons', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const courses = await listCourses(db);
  if (!courses.some((course) => course.id === id)) return c.json({ error: 'not found' }, 404);
  const limit = Math.min(positiveInt(c.req.query('limit')) ?? DEFAULT_LIMIT, MAX_LIMIT);
  return c.json(await lessonsBefore(db, id, positiveInt(c.req.query('before')), limit));
});

publicRoutes.get('/api/courses/:id/pdf/:index', async (c) => {
  const index = Number(c.req.param('index'));
  const course = (await listCourses(c.env.DB)).find((x) => x.id === c.req.param('id'));
  const url = Number.isInteger(index) && index >= 0 ? course?.pdfUrls[index] : undefined;
  if (!url) return c.json({ error: 'not found' }, 404);
  const edge = (caches as unknown as { default: Cache }).default;
  return servePdf(url, { fetch: (input, init) => fetch(input, init), cache: edge, waitUntil: (p) => c.executionCtx.waitUntil(p) });
});
