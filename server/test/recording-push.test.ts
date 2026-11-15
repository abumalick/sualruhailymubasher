import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fcm } from '../src/fcm';
import { sendRecordingPush, shouldPushRecording } from '../src/jobs/recording-push';
import type { CourseRow } from '../src/repo';

describe('shouldPushRecording', () => {
  it.each([
    [true, true, true, true],
    [false, true, true, false],
    [true, false, true, false],
    [true, true, false, false],
    [false, false, false, false],
  ])('hadLessonsBefore=%s isNewestInSequence=%s recordingAdded=%s -> %s', (hadLessonsBefore, isNewestInSequence, recordingAdded, want) => {
    expect(shouldPushRecording({ hadLessonsBefore, isNewestInSequence, recordingAdded })).toBe(want);
  });
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
