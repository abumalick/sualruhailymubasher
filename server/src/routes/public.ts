import type { CourseDTO, StateDTO } from '@albadr/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from '../index';
import { nextPassage } from '../estimate';
import {
  expectedNextNumber,
  getLive,
  getSetting,
  latestLessons,
  lessonsBefore,
  listCourses,
  listExceptions,
} from '../repo';
import { lessonTime, nextLessonDate } from '../schedule';
import { medinaDate } from '../time';

const EMBED_URL = 'https://albadrnet.mixlr.com/embed';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const LINKS = [
  { title: 'موقع الشيخ', url: 'https://al-badr.net' },
  { title: 'البث المباشر على الموقع', url: 'https://al-badr.net/streaming' },
  { title: 'قناة التلغرام', url: 'https://t.me/albadrnet' },
  { title: 'روابط الشيخ', url: 'https://beacons.ai/albadr' },
  { title: 'مجتمع واتساب ١', url: 'https://chat.whatsapp.com/LNdo3uxE29RDlgVtLmNHZi' },
  { title: 'مجتمع واتساب ٢', url: 'https://chat.whatsapp.com/DZCeVH4kiLT8Gul4yMicY0' },
];

const positiveInt = (raw: string | undefined) => {
  const n = Number(raw);
  return raw !== undefined && Number.isInteger(n) && n > 0 ? n : null;
};

export const publicRoutes = new Hono<{ Bindings: Env }>();

publicRoutes.use('/api/state', cors({ origin: '*' }));
publicRoutes.use('/api/courses/*', cors({ origin: '*' }));

publicRoutes.get('/api/state', async (c) => {
  const db = c.env.DB;
  const now = new Date();
  const [courses, live, mode, exceptions] = await Promise.all([
    listCourses(db, { activeOnly: true }),
    getLive(db),
    getSetting(db, 'live_mode'),
    listExceptions(db, medinaDate(now)),
  ]);
  const direct = mode === 'direct';

  const dtos: CourseDTO[] = await Promise.all(
    courses.map(async (course) => {
      const latest = await latestLessons(db, course.id, 5);
      const mine = exceptions.filter((e) => e.courseId === null || e.courseId === course.id);
      const next = nextLessonDate(course, mine, now);
      return {
        id: course.id,
        title: course.title,
        slot: course.slot,
        weekdays: course.weekdays,
        time: next?.time ?? lessonTime(course, medinaDate(now)),
        pdfUrls: course.pdfUrls,
        latest,
        next: next && nextPassage(course, latest, next, await expectedNextNumber(db, course.id, next.date, now)),
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
