import { courseTopic, lessonNoticeBody, NOTICE_TAG, NOTICE_TITLE } from '@albadr/shared';
import type { Fcm } from '../fcm';
import { insertLessonIfNew, latestLessons, listCourses, markSent, setRecordingUrl } from '../repo';
import type { CourseRow } from '../repo';
import { fetchLatestLessons, parseDetailMp3 } from '../sources/albadr';

const MAX_DETAIL_FETCHES = 8;
const LESSON_WINDOW = 60;
const REC_TTL_SEC = 24 * 3600;

export interface RecordingDeps {
  db: D1Database;
  fetch: typeof fetch;
  fcm: Fcm;
  now: Date;
}

async function fetchMp3(path: string, f: typeof fetch): Promise<string | null> {
  const res = await f(`https://al-badr.net${path}`);
  return res.ok ? parseDetailMp3(await res.text()) : null;
}

async function ingestCourse(course: CourseRow, { db, fetch: f, fcm }: RecordingDeps): Promise<void> {
  const hadLessons = (await latestLessons(db, course.id, 1)).length > 0;
  for (const e of await fetchLatestLessons(course.seriesId, f)) {
    await insertLessonIfNew(db, course.id, { ...e, recordingUrl: null });
  }

  const lessons = await latestLessons(db, course.id, LESSON_WINDOW);
  const newestNumber = lessons[0]?.number;
  const pending = lessons.filter((l) => l.recordingUrl === null).slice(0, MAX_DETAIL_FETCHES);

  for (const lesson of pending) {
    const url = await fetchMp3(lesson.detailPath, f);
    if (!url) continue;
    await setRecordingUrl(db, course.id, lesson.number, url);
    if (!hadLessons || lesson.number !== newestNumber) continue;
    if (!(await markSent(db, `rec:${course.id}:${lesson.number}`))) continue;
    try {
      await fcm.sendToTopic(courseTopic(course.id, 'rec'), {
        title: NOTICE_TITLE.rec,
        body: lessonNoticeBody(course.title, lesson.number),
        data: { kind: 'rec', courseId: course.id, number: String(lesson.number) },
        tag: NOTICE_TAG,
        ttlSec: REC_TTL_SEC,
      });
    } catch (e) {
      console.error('recording push failed', e);
    }
  }
}

export async function runRecordingIngest(deps: RecordingDeps): Promise<void> {
  for (const course of await listCourses(deps.db, { activeOnly: true })) {
    if (!course.seriesId) continue;
    try {
      await ingestCourse(course, deps);
    } catch (e) {
      console.error(`recording ingest failed for ${course.id}`, e);
    }
  }
}
