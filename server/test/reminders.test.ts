import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runReminders } from '../src/jobs/reminders';
import { addException, insertLessonIfNew, patchLesson, recordBroadcast } from '../src/repo';
import type { Fcm } from '../src/fcm';

function setup() {
  const sendToTopic = vi.fn().mockResolvedValue(undefined);
  const run = (iso: string) => runReminders({ db: env.DB, fcm: { sendToTopic } as unknown as Fcm, now: new Date(iso) });
  return { sendToTopic, run };
}

beforeEach(async () => {
  await env.DB.exec('DELETE FROM sent_notifications');
  await env.DB.exec('DELETE FROM lessons');
  await env.DB.exec('DELETE FROM exceptions');
  await env.DB.exec('DELETE FROM broadcasts');
});

const lesson = (courseId: string, number: number) =>
  insertLessonIfNew(env.DB, courseId, { number, hijriDate: '', startPoint: 'س', recordingUrl: null, detailPath: `/d/${number}` });

describe('runReminders', () => {
  it('sends one fajr prep the evening before and not twice', async () => {
    const { sendToTopic, run } = setup();
    await lesson('tafsir-saadi', 4);
    await run('2026-11-01T18:00:00Z');
    await run('2026-11-01T18:03:00Z');
    expect(sendToTopic).toHaveBeenCalledTimes(1);
    expect(sendToTopic).toHaveBeenCalledWith('c-tafsir-saadi-prep', {
      title: 'حضّر للدرس القادم',
      body: expect.stringContaining('يتابع من حيث توقف الدرس ٤'),
      data: { kind: 'prep', courseId: 'tafsir-saadi', number: '5' },
    });
  });

  it('counts a lesson broadcast today but not yet published', async () => {
    const { sendToTopic, run } = setup();
    await lesson('tafsir-saadi', 4);
    await env.DB.exec("UPDATE lessons SET created_at = '2026-10-01T00:00:00.000Z'");
    await recordBroadcast(env.DB, 'b', 'tafsir-saadi', '2026-11-01T02:40:00.000Z');
    await run('2026-11-01T18:00:00Z');
    expect(sendToTopic.mock.calls[0][1]).toMatchObject({
      body: expect.stringContaining('يتابع من حيث توقف الدرس ٥'),
      data: { number: '6' },
    });
  });

  it('uses the transcribed start point', async () => {
    const { sendToTopic, run } = setup();
    await lesson('tafsir-saadi', 4);
    await patchLesson(env.DB, 'tafsir-saadi', 4, { endPoint: 'قوله تعالى', endPage: 9 });
    await run('2026-11-01T18:00:00Z');
    expect(sendToTopic.mock.calls[0][1].body).toMatch(/ · قوله تعالى$/);
  });

  it('uses the bare title with no lessons yet', async () => {
    const { sendToTopic, run } = setup();
    await run('2026-11-01T18:00:00Z');
    expect(sendToTopic.mock.calls[0][1]).toMatchObject({ body: 'شرح تفسير السعدي', data: { number: '1' } });
  });

  it('does nothing outside the window', async () => {
    const { sendToTopic, run } = setup();
    await run('2026-11-01T17:59:00Z');
    await run('2026-11-01T18:05:00Z');
    expect(sendToTopic).not.toHaveBeenCalled();
  });

  it('skips Friday evening when the next fajr lesson is Sunday', async () => {
    const { sendToTopic, run } = setup();
    await run('2026-11-06T18:00:00Z');
    expect(sendToTopic).not.toHaveBeenCalled();
  });

  it('sends the maghrib prep the same afternoon', async () => {
    const { sendToTopic, run } = setup();
    await run('2026-11-02T12:30:00Z');
    expect(sendToTopic).toHaveBeenCalledTimes(1);
    expect(sendToTopic.mock.calls[0][0]).toBe('c-kitab-tawhid-prep');
  });

  it('sends nothing when the lesson is cancelled', async () => {
    const { sendToTopic, run } = setup();
    await addException(env.DB, { courseId: 'kitab-tawhid', kind: 'cancel', dateFrom: '2026-11-02' });
    await run('2026-11-02T12:30:00Z');
    expect(sendToTopic).not.toHaveBeenCalled();
  });

  it('logs a push failure and does not retry', async () => {
    const { sendToTopic, run } = setup();
    sendToTopic.mockRejectedValueOnce(new Error('boom'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await run('2026-11-01T18:00:00Z');
    await run('2026-11-01T18:01:00Z');
    expect(err).toHaveBeenCalledTimes(1);
    expect(sendToTopic).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
});
