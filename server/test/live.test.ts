import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import liveJson from './fixtures/channel-view-live.json';
import offlineJson from './fixtures/channel-view-offline.json';
import { runLivePoll } from '../src/jobs/live';
import { parseChannelView } from '../src/sources/mixlr';
import { getLive, insertLessonIfNew, recordBroadcast, setLive } from '../src/repo';
import type { Fcm } from '../src/fcm';

const UID = 'fbaff98792b1bbbcb8e73ad92348916c';
const respond = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });

function setup(fetchImpl: typeof fetch, now = new Date('2026-10-19T15:20:30Z')) {
  const sendToTopic = vi.fn().mockResolvedValue(undefined);
  const sendDataToTopic = vi.fn().mockResolvedValue(undefined);
  const deps = { db: env.DB, fetch: fetchImpl, fcm: { sendToTopic, sendDataToTopic } as unknown as Fcm, now };
  return { deps, sendToTopic, sendDataToTopic };
}

const withStart = (startedAt: string, uid = UID) => ({
  ...liveJson,
  included: liveJson.included.map((i) =>
    i.type === 'broadcast' ? { ...i, attributes: { ...i.attributes, started_at: startedAt, uid } } : i,
  ),
});

beforeEach(async () => {
  await env.DB.exec('DELETE FROM sent_notifications');
  await env.DB.exec('DELETE FROM lessons');
  await env.DB.exec('DELETE FROM broadcasts');
  await env.DB.exec("DELETE FROM settings WHERE key = 'live-end-pending'");
});

describe('parseChannelView', () => {
  it('parses the live capture', () => {
    expect(parseChannelView(liveJson)).toEqual({
      live: true,
      uid: UID,
      streamUrl: `https://listen.mixlr.com/${UID}`,
      startedAt: '2026-10-19T15:19:46.000Z',
    });
  });

  it('parses the offline capture', () => {
    expect(parseChannelView(offlineJson)).toMatchObject({ live: false, uid: null });
  });

  it('returns null for an unexpected shape', () => {
    expect(parseChannelView({})).toBeNull();
    expect(parseChannelView(null)).toBeNull();
    expect(parseChannelView('<html>')).toBeNull();
  });
});

describe('runLivePoll', () => {
  it('sends one push across consecutive polls', async () => {
    const { deps, sendToTopic } = setup(respond(liveJson) as typeof fetch);
    await runLivePoll(deps);
    await runLivePoll(deps);
    expect(sendToTopic).toHaveBeenCalledTimes(1);
    expect(await getLive(env.DB)).toMatchObject({ isLive: true, broadcastUid: UID, courseId: 'kitab-tawhid' });
  });

  it('maps a Monday maghrib broadcast to its course with the next lesson number', async () => {
    await insertLessonIfNew(env.DB, 'kitab-tawhid', {
      number: 7, hijriDate: '01-01-1448', startPoint: 'x', recordingUrl: null, detailPath: '/detail/x',
    });
    const { deps, sendToTopic } = setup(respond(liveJson) as typeof fetch);
    await runLivePoll(deps);
    expect(sendToTopic).toHaveBeenCalledWith('c-kitab-tawhid-live', {
      title: '🔴 بدأ البث المباشر',
      body: expect.stringMatching(/ · الدرس ٨$/),
      data: { kind: 'live', courseId: 'kitab-tawhid', number: '8' },
      tag: 'live',
      ttlSec: 7200,
    });
  });

  it('counts an earlier broadcast not yet published on al-badr.net', async () => {
    await insertLessonIfNew(env.DB, 'kitab-tawhid', {
      number: 7, hijriDate: '01-01-1448', startPoint: 'x', recordingUrl: null, detailPath: '/detail/x',
    });
    await env.DB.exec("UPDATE lessons SET created_at = '2026-10-01T00:00:00.000Z'");
    await recordBroadcast(env.DB, 'earlier', 'kitab-tawhid', '2026-10-15T15:20:00.000Z');
    const { deps, sendToTopic } = setup(respond(liveJson) as typeof fetch);
    await runLivePoll(deps);
    expect(sendToTopic.mock.calls[0][1].data.number).toBe('9');
  });

  it('records every live broadcast with its course', async () => {
    await runLivePoll(setup(respond(liveJson) as typeof fetch).deps);
    await runLivePoll(setup(respond(withStart('2026-10-23T09:00:00.000Z', 'other-uid')) as typeof fetch).deps);
    const { results } = await env.DB.prepare('SELECT uid, course_id FROM broadcasts ORDER BY uid').all();
    expect(results).toEqual([{ uid: UID, course_id: 'kitab-tawhid' }, { uid: 'other-uid', course_id: null }]);
  });

  it('pushes once per course and day when the broadcaster reconnects', async () => {
    const first = setup(respond(liveJson) as typeof fetch);
    await runLivePoll(first.deps);
    const second = setup(respond(withStart('2026-10-19T15:40:00.000Z', 'new-uid')) as typeof fetch);
    await runLivePoll(second.deps);
    expect(first.sendToTopic).toHaveBeenCalledTimes(1);
    expect(second.sendToTopic).not.toHaveBeenCalled();
  });

  it('numbers the first lesson 1 when the course has none', async () => {
    const { deps, sendToTopic } = setup(respond(liveJson) as typeof fetch);
    await runLivePoll(deps);
    expect(sendToTopic.mock.calls[0][1].data.number).toBe('1');
  });

  it('sends live-other for a broadcast outside every window', async () => {
    const { deps, sendToTopic } = setup(respond(withStart('2026-10-23T09:00:00.000Z')) as typeof fetch);
    await runLivePoll(deps);
    expect(sendToTopic).toHaveBeenCalledWith('live-other', {
      title: '🔴 بث مباشر الآن',
      body: 'دروس الشيخ عبد الرزاق البدر',
      data: { kind: 'live-other', number: '' },
      tag: 'live',
      ttlSec: 7200,
    });
    expect((await getLive(env.DB)).courseId).toBeNull();
  });

  it('leaves state untouched and sends nothing on a 503', async () => {
    const before = { isLive: true, broadcastUid: 'old', streamUrl: 's', courseId: null, startedAt: '2026-10-19T15:00:00.000Z' };
    await setLive(env.DB, before);
    const { deps, sendToTopic } = setup(respond('down', 503) as typeof fetch);
    await runLivePoll(deps);
    expect(sendToTopic).not.toHaveBeenCalled();
    expect(await getLive(env.DB)).toEqual(before);
  });

  it('leaves state untouched when fetch throws, on non-JSON, and on live without a broadcast', async () => {
    const before = { isLive: true, broadcastUid: 'old', streamUrl: 's', courseId: null, startedAt: null };
    await setLive(env.DB, before);
    const noBroadcast = { ...liveJson, included: [] };
    for (const f of [
      (async () => { throw new Error('net'); }) as typeof fetch,
      (async () => new Response('<html>')) as typeof fetch,
      respond(noBroadcast) as typeof fetch,
    ]) {
      const { deps, sendToTopic } = setup(f);
      await runLivePoll(deps);
      expect(sendToTopic).not.toHaveBeenCalled();
    }
    expect(await getLive(env.DB)).toEqual(before);
  });

  it('clears live state when the channel goes offline', async () => {
    await setLive(env.DB, { isLive: true, broadcastUid: UID, streamUrl: 's', courseId: 'kitab-tawhid', startedAt: 'x' });
    const { deps, sendToTopic } = setup(respond(offlineJson) as typeof fetch);
    await runLivePoll(deps);
    expect(sendToTopic).not.toHaveBeenCalled();
    expect(await getLive(env.DB)).toEqual({ isLive: false, broadcastUid: null, streamUrl: null, courseId: null, startedAt: null });
  });

  it('keeps live state when the push fails', async () => {
    const { deps, sendToTopic } = setup(respond(liveJson) as typeof fetch);
    sendToTopic.mockRejectedValue(new Error('fcm down'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runLivePoll(deps);
    expect(err).toHaveBeenCalled();
    expect((await getLive(env.DB)).isLive).toBe(true);
    err.mockRestore();
  });
});

describe('live dismiss', () => {
  const offline = respond(offlineJson) as typeof fetch;
  const at = (min: number) => new Date(Date.parse('2026-10-19T17:00:00Z') + min * 60_000);
  const poll = (fetchImpl: typeof fetch, min: number, fcm: Fcm) =>
    runLivePoll({ db: env.DB, fetch: fetchImpl, fcm, now: at(min) });

  it('dismisses the live notification once the broadcast has stayed off past the grace period', async () => {
    await setLive(env.DB, { isLive: true, broadcastUid: UID, streamUrl: 's', courseId: 'kitab-tawhid', startedAt: 'x' });
    const { deps, sendDataToTopic } = setup(offline);
    await poll(offline, 0, deps.fcm);
    await poll(offline, 2, deps.fcm);
    expect(sendDataToTopic).not.toHaveBeenCalled();
    await poll(offline, 3, deps.fcm);
    await poll(offline, 4, deps.fcm);
    expect(sendDataToTopic).toHaveBeenCalledTimes(1);
    expect(sendDataToTopic).toHaveBeenCalledWith('c-kitab-tawhid-live', { dismiss: 'live' }, 7200);
  });

  it('sends the dismiss to live-other for a broadcast outside every course', async () => {
    await setLive(env.DB, { isLive: true, broadcastUid: UID, streamUrl: 's', courseId: null, startedAt: 'x' });
    const { deps, sendDataToTopic } = setup(offline);
    await poll(offline, 0, deps.fcm);
    await poll(offline, 5, deps.fcm);
    expect(sendDataToTopic).toHaveBeenCalledWith('live-other', { dismiss: 'live' }, 7200);
  });

  it('does not dismiss when the broadcaster reconnects within the grace period', async () => {
    await setLive(env.DB, { isLive: true, broadcastUid: UID, streamUrl: 's', courseId: 'kitab-tawhid', startedAt: 'x' });
    const { deps, sendDataToTopic } = setup(offline);
    await poll(offline, 0, deps.fcm);
    await poll(respond(withStart('2026-10-19T17:01:00Z', 'again')) as typeof fetch, 1, deps.fcm);
    await poll(offline, 3, deps.fcm);
    expect(sendDataToTopic).not.toHaveBeenCalled();
    await poll(offline, 6, deps.fcm);
    expect(sendDataToTopic).toHaveBeenCalledTimes(1);
  });

  it('logs a failed dismiss and does not resend it', async () => {
    await setLive(env.DB, { isLive: true, broadcastUid: UID, streamUrl: 's', courseId: 'kitab-tawhid', startedAt: 'x' });
    const { deps, sendDataToTopic } = setup(offline);
    sendDataToTopic.mockRejectedValue(new Error('fcm down'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await poll(offline, 0, deps.fcm);
    await poll(offline, 3, deps.fcm);
    await poll(offline, 4, deps.fcm);
    expect(sendDataToTopic).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalledWith('live dismiss push failed', expect.any(Error));
    err.mockRestore();
  });

  it('sends nothing on an offline poll without a broadcast that just ended', async () => {
    const { deps, sendDataToTopic } = setup(offline);
    await poll(offline, 0, deps.fcm);
    await poll(offline, 10, deps.fcm);
    expect(sendDataToTopic).not.toHaveBeenCalled();
  });
});
