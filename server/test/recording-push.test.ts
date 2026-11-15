import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fcm } from '../src/fcm';
import { sendRecordingPush, shouldPushRecording } from '../src/jobs/recording-push';
import type { CourseRow } from '../src/repo';

describe('shouldPushRecording', () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31])(
    'pushes only when all four hold (mask %i)',
    (mask) => {
      const [hadLessonsBefore, isNewestInSequence, recordingAdded, isRecent] = [1, 2, 4, 8].map((b) => (mask & b) !== 0);
      expect(shouldPushRecording({ hadLessonsBefore, isNewestInSequence, recordingAdded, isRecent })).toBe((mask & 15) === 15);
    },
  );
});

const course = { id: 'push-c', title: 'شرح كتاب التوحيد', lessonWord: 'الدرس' } as CourseRow;

describe('sendRecordingPush', () => {
  beforeEach(async () => {
    await env.DB.exec('DELETE FROM sent_notifications');
  });

  it('sends one notice to the course rec topic and dedupes a repeat', async () => {
    const sendToTopic = vi.fn().mockResolvedValue(undefined);
    const deps = { db: env.DB, fcm: { sendToTopic } as unknown as Fcm };
    const lesson = { number: 10, section: '', sectionNumber: 10 };
    expect(await sendRecordingPush(deps, course, lesson)).toBe(true);
    expect(await sendRecordingPush(deps, course, lesson)).toBe(false);
    expect(sendToTopic).toHaveBeenCalledTimes(1);
    expect(sendToTopic).toHaveBeenCalledWith('c-push-c-rec', {
      title: 'التسجيل متاح · راجع الدرس',
      body: 'شرح كتاب التوحيد · الدرس ١٠',
      data: { kind: 'rec', courseId: 'push-c', number: '10' },
      tag: expect.any(String),
      ttlSec: 86400,
    });
  });

  it('uses the section label when the lesson has a section', async () => {
    const sendToTopic = vi.fn().mockResolvedValue(undefined);
    await sendRecordingPush({ db: env.DB, fcm: { sendToTopic } as unknown as Fcm }, course, { number: 3, section: 'كتاب الشهادات', sectionNumber: 2 });
    expect(sendToTopic.mock.calls[0][1].body).toBe('شرح كتاب التوحيد · كتاب الشهادات – الدرس ٢');
  });
});
