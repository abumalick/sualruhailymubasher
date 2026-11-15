import { courseTopic, NOTICE_TAG, NOTICE_TITLE, prepNoticeBody } from '@sualruhaily/shared';
import { nextPassage } from '../estimate';
import type { Fcm } from '../fcm';
import { heldSinceLatest, latestLessons, listCourses, listExceptions, markSent, type CourseRow } from '../repo';
import { nextLessonDate } from '../schedule';
import { addDays, medinaDate, medinaInstant } from '../time';

export interface RemindersDeps {
  db: D1Database;
  fcm: Fcm;
  now: Date;
}

const WINDOW_MIN = 5;
const ASR_PREP_LEAD_MIN = 180;
const FIXED_TARGET_MIN = { fajr: 21 * 60, maghrib: 15 * 60 + 30 };

const minutesOfDay = (at: Date) => (Math.floor((at.getTime() + 3 * 3600_000) / 60_000) % 1440 + 1440) % 1440;

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

async function remind(course: CourseRow, { db, fcm, now }: RemindersDeps, exceptions: Awaited<ReturnType<typeof listExceptions>>) {
  const today = medinaDate(now);
  const next = nextLessonDate(course, exceptions, now);
  if (!next) return;

  const target = course.slot === 'asr' ? minutesOf(next.time) - ASR_PREP_LEAD_MIN : FIXED_TARGET_MIN[course.slot];
  const elapsed = minutesOfDay(now) - target;
  if (elapsed < 0 || elapsed >= WINDOW_MIN) return;
  const due = course.slot === 'fajr' ? addDays(today, 1) : today;
  if (next.date !== due) return;

  if (!(await markSent(db, `prep:${course.id}:${next.date}`))) return;

  const latest = await latestLessons(db, course.id, 5);
  const passage = nextPassage(course, latest, next, await heldSinceLatest(db, course.id, next.date, now));
  if (!passage) return;
  await fcm.sendToTopic(courseTopic(course.id, 'prep'), {
    title: NOTICE_TITLE.prep,
    body: prepNoticeBody(course.title, course.place, passage.startPoint),
    data: { kind: 'prep', courseId: course.id, number: '' },
    tag: NOTICE_TAG,
    ttlSec: (medinaInstant(next.date, next.time).getTime() - now.getTime()) / 1000,
  });
}

export async function runReminders(deps: RemindersDeps): Promise<void> {
  const [courses, exceptions] = await Promise.all([
    listCourses(deps.db, { activeOnly: true }),
    listExceptions(deps.db, medinaDate(deps.now)),
  ]);
  for (const course of courses) {
    try {
      await remind(course, deps, exceptions);
    } catch (e) {
      console.error(`prep reminder failed for ${course.id}`, e);
    }
  }
}
