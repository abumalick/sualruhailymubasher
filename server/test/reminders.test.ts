import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runReminders } from '../src/jobs/reminders';
import { addException, insertLessonIfNew, patchLesson, recordBroadcast, upsertCourse } from '../src/repo';
import type { Fcm } from '../src/fcm';

function setup() {
  const sendToTopic = vi.fn().mockResolvedValue(undefined);
  const run = (iso: string) => runReminders({ db: env.DB, fcm: { sendToTopic } as unknown as Fcm, now: new Date(iso) });
  return { sendToTopic, run };
}

beforeEach(async () => {
  await env.DB.exec("DELETE FROM courses WHERE id = 'maghrib-test'");
  await env.DB.exec('DELETE FROM sent_notifications');
  await env.DB.exec('DELETE FROM lessons');
  await env.DB.exec('DELETE FROM exceptions');
  await env.DB.exec('DELETE FROM broadcasts');
});

const maghribCourse = () =>
  upsertCourse(env.DB, 'maghrib-test', {
    title: 'درس المغرب', slot: 'maghrib', place: 'المسجد', weekdays: [0, 1, 2, 3, 4], offsetMin: 30,
    seriesId: 1, pdfUrls: [], active: true,
  });

const lesson = (courseId: string, number: number) =>
  insertLessonIfNew(env.DB, courseId, { number, hijriDate: '', startPoint: 'س', recordingUrl: null, detailPath: `/d/${number}` });

describe('runReminders', () => {
  it('sends one fajr prep the Friday evening before the Saturday lesson and not twice', async () => {
    const { sendToTopic, run } = setup();
    await lesson('kitab-tawhid', 4);
    await run('2026-11-20T18:00:00Z');
    await run('2026-11-20T18:03:00Z');
    expect(sendToTopic).toHaveBeenCalledTimes(1);
    expect(sendToTopic).toHaveBeenCalledWith('c-kitab-tawhid-prep', {
      title: 'حضّر للدرس القادم',
      body: 'شرح كتاب التوحيد · المسجد النبوي (الغربية)',
      data: { kind: 'prep', courseId: 'kitab-tawhid', number: '' },
      tag: 'notice',
      ttlSec: expect.any(Number),
    });
    const ttl = sendToTopic.mock.calls[0][1].ttlSec / 3600;
    expect(ttl).toBeGreaterThan(7);
    expect(ttl).toBeLessThan(10);
  });

  it('counts a lesson broadcast today but not yet published', async () => {
    const { sendToTopic, run } = setup();
    await lesson('kitab-tawhid', 4);
    await env.DB.exec("UPDATE lessons SET created_at = '2026-10-01T00:00:00.000Z'");
    await recordBroadcast(env.DB, 'b', 'kitab-tawhid', '2026-11-14T02:40:00.000Z');
    await run('2026-11-20T18:00:00Z');
    expect(sendToTopic.mock.calls[0][1]).toMatchObject({ data: { number: '' } });
    expect(sendToTopic.mock.calls[0][1].body).not.toMatch(/[0-9٠-٩]/);
  });

  it('uses the transcribed start point', async () => {
    const { sendToTopic, run } = setup();
    await lesson('kitab-tawhid', 4);
    await patchLesson(env.DB, 'kitab-tawhid', 4, { endPoint: 'قوله تعالى', endPage: 9 });
    await run('2026-11-20T18:00:00Z');
    expect(sendToTopic.mock.calls[0][1].body).toMatch(/ — يبدأ من: قوله تعالى$/);
  });

  it('uses the bare title with no lessons yet', async () => {
    const { sendToTopic, run } = setup();
    await run('2026-11-20T18:00:00Z');
    expect(sendToTopic.mock.calls[0][1]).toMatchObject({ body: expect.not.stringMatching(/يبدأ من/), data: { number: '' } });
  });

  it('does nothing outside the window', async () => {
    const { sendToTopic, run } = setup();
    await run('2026-11-20T17:59:00Z');
    await run('2026-11-20T18:05:00Z');
    expect(sendToTopic).not.toHaveBeenCalled();
  });

  it('skips a Thursday evening when the next fajr lesson is not the next day', async () => {
    const { sendToTopic, run } = setup();
    await run('2026-11-19T18:00:00Z');
    expect(sendToTopic).not.toHaveBeenCalled();
  });

  it('sends the maghrib prep the same afternoon', async () => {
    const { sendToTopic, run } = setup();
    await maghribCourse();
    await run('2026-11-02T12:30:00Z');
    expect(sendToTopic).toHaveBeenCalledTimes(1);
    expect(sendToTopic.mock.calls[0][0]).toBe('c-maghrib-test-prep');
  });

  it('sends an asr prep 180 minutes before the lesson on its day, not the day before', async () => {
    const { sendToTopic, run } = setup();
    // targhib: Wednesday 2026-11-18, Asr 15:13 + 22 min = 15:35 Medina, so the prep is due at 12:35 (09:35Z)
    await run('2026-11-17T09:35:00Z');
    await run('2026-11-17T12:35:00Z');
    await run('2026-11-18T09:34:00Z');
    await run('2026-11-18T09:40:00Z');
    expect(sendToTopic).not.toHaveBeenCalled();
    await run('2026-11-18T09:35:00Z');
    expect(sendToTopic).toHaveBeenCalledTimes(1);
    expect(sendToTopic.mock.calls[0][0]).toBe('c-targhib-prep');
    expect(sendToTopic.mock.calls[0][1].ttlSec).toBeCloseTo(180 * 60, -2);
  });

  it('sends nothing when the lesson is cancelled', async () => {
    const { sendToTopic, run } = setup();
    await maghribCourse();
    await addException(env.DB, { courseId: 'maghrib-test', kind: 'cancel', dateFrom: '2026-11-02' });
    await run('2026-11-02T12:30:00Z');
    expect(sendToTopic).not.toHaveBeenCalled();
  });

  it('logs a push failure and does not retry', async () => {
    const { sendToTopic, run } = setup();
    sendToTopic.mockRejectedValueOnce(new Error('boom'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await run('2026-11-20T18:00:00Z');
    await run('2026-11-20T18:01:00Z');
    expect(err).toHaveBeenCalledTimes(1);
    expect(sendToTopic).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
});
