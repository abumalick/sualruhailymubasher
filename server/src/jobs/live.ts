import { courseTopic, DISMISS_LIVE, LIVE_OTHER_TOPIC, LIVE_TAG, toArabicDigits } from '@albadr/shared';
import type { Fcm } from '../fcm';
import { courseInWindow } from '../schedule';
import { parseChannelView } from '../sources/mixlr';
import {
  expectedNextNumber,
  getLive,
  getSetting,
  listCourses,
  listExceptions,
  markSent,
  recordBroadcast,
  setLive,
  setSetting,
  type LiveRow,
} from '../repo';
import { medinaDate } from '../time';

const CHANNEL_VIEW_URL = 'https://apicdn.mixlr.com/v3/channel_view/albadrnet';
const LIVE_TTL_SEC = 2 * 3600;
// A Mixlr reconnect shows as a short gap; only a broadcast still off after this counts as ended.
const END_GRACE_MS = 3 * 60_000;
const END_KEY = 'live-end-pending';

export interface LiveDeps {
  db: D1Database;
  fetch: typeof fetch;
  fcm: Fcm;
  now: Date;
}

const liveTopic = (courseId: string | null) => (courseId ? courseTopic(courseId, 'live') : LIVE_OTHER_TOPIC);

function readPending(value: string | null): { topic: string; at: string } | null {
  try {
    const p = JSON.parse(value ?? '');
    return typeof p?.topic === 'string' && typeof p?.at === 'string' ? p : null;
  } catch {
    return null;
  }
}

async function dismissEndedLive(db: D1Database, fcm: Fcm, now: Date, prev: LiveRow): Promise<void> {
  if (prev.isLive) {
    await setSetting(db, END_KEY, JSON.stringify({ topic: liveTopic(prev.courseId), at: now.toISOString() }));
    return;
  }
  const pending = readPending(await getSetting(db, END_KEY));
  if (!pending || now.getTime() - Date.parse(pending.at) < END_GRACE_MS) return;
  await setSetting(db, END_KEY, '');
  try {
    await fcm.sendDataToTopic(pending.topic, DISMISS_LIVE, LIVE_TTL_SEC);
  } catch (e) {
    console.error('live dismiss push failed', e);
  }
}

async function fetchChannelView(f: typeof fetch) {
  try {
    const res = await f(CHANNEL_VIEW_URL);
    if (!res.ok) return null;
    return parseChannelView(await res.json());
  } catch {
    return null;
  }
}

export async function runLivePoll({ db, fetch: f, fcm, now }: LiveDeps): Promise<void> {
  const view = await fetchChannelView(f);
  if (!view) return;

  if (!view.live) {
    const prev = await getLive(db);
    await setLive(db, { isLive: false, broadcastUid: null, streamUrl: null, courseId: null, startedAt: null });
    await dismissEndedLive(db, fcm, now, prev);
    return;
  }
  if (!view.uid) return;
  if (readPending(await getSetting(db, END_KEY))) await setSetting(db, END_KEY, '');

  const at = view.startedAt ? new Date(view.startedAt) : now;
  const [courses, exceptions] = await Promise.all([
    listCourses(db, { activeOnly: true }),
    listExceptions(db, medinaDate(at)),
  ]);
  const course = courseInWindow(courses, exceptions, at);

  await setLive(db, {
    isLive: true,
    broadcastUid: view.uid,
    streamUrl: view.streamUrl,
    courseId: course?.id ?? null,
    startedAt: view.startedAt,
  });

  await recordBroadcast(db, view.uid, course?.id ?? null, at.toISOString());

  const day = medinaDate(at);
  if (!(await markSent(db, course ? `live:${course.id}:${day}` : `live:${view.uid}`))) return;

  try {
    if (course) {
      const number = await expectedNextNumber(db, course.id, day, now);
      await fcm.sendToTopic(liveTopic(course.id), {
        title: '🔴 بدأ البث المباشر',
        body: `${course.title} · الدرس ${toArabicDigits(number)}`,
        data: { kind: 'live', courseId: course.id, number: String(number) },
        tag: LIVE_TAG,
        ttlSec: LIVE_TTL_SEC,
      });
    } else {
      await fcm.sendToTopic(LIVE_OTHER_TOPIC, {
        title: '🔴 بث مباشر الآن',
        body: 'دروس الشيخ عبد الرزاق البدر',
        data: { kind: 'live-other', number: '' },
        tag: LIVE_TAG,
        ttlSec: LIVE_TTL_SEC,
      });
    }
  } catch (e) {
    console.error('live push failed', e);
  }
}
