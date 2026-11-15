import { courseTopic, lessonLabel, NOTICE_TAG, NOTICE_TITLE } from '@sualruhaily/shared';
import type { Fcm } from '../fcm';
import { markSent, type CourseRow } from '../repo';

const REC_TTL_SEC = 24 * 3600;

export interface RecordingPushDeps {
  db: D1Database;
  fcm: Fcm;
}

export const shouldPushRecording = (s: {
  hadLessonsBefore: boolean;
  isNewestInSequence: boolean;
  recordingAdded: boolean;
  isRecent: boolean;
}): boolean =>
  s.hadLessonsBefore && s.isNewestInSequence && s.recordingAdded && s.isRecent;

// Returns false when this lesson's push was already sent.
export async function sendRecordingPush(
  { db, fcm }: RecordingPushDeps,
  course: Pick<CourseRow, 'id' | 'title' | 'lessonWord'>,
  lesson: { number: number; section: string; sectionNumber: number | null },
): Promise<boolean> {
  if (!(await markSent(db, `rec:${course.id}:${lesson.number}`))) return false;
  await fcm.sendToTopic(courseTopic(course.id, 'rec'), {
    title: NOTICE_TITLE.rec,
    body: `${course.title} · ${lessonLabel(course.lessonWord, lesson.section, lesson.sectionNumber)}`,
    data: { kind: 'rec', courseId: course.id, number: String(lesson.number) },
    tag: NOTICE_TAG,
    ttlSec: REC_TTL_SEC,
  });
  return true;
}
