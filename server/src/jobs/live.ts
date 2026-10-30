import { toArabicDigits } from '@albadr/shared';
import type { Fcm } from '../fcm';
import { courseInWindow } from '../schedule';
import { parseChannelView } from '../sources/mixlr';
import { latestLessons, listCourses, listExceptions, markSent, setLive } from '../repo';
import { medinaDate } from '../time';

const CHANNEL_VIEW_URL = 'https://apicdn.mixlr.com/v3/channel_view/albadrnet';

export interface LiveDeps {
  db: D1Database;
  fetch: typeof fetch;
  fcm: Fcm;
  now: Date;
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
    await setLive(db, { isLive: false, broadcastUid: null, streamUrl: null, courseId: null, startedAt: null });
    return;
  }
  if (!view.uid) return;

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

  if (!(await markSent(db, `live:${view.uid}`))) return;

  try {
    if (course) {
      const [latest] = await latestLessons(db, course.id, 1);
      const number = (latest?.number ?? 0) + 1;
      await fcm.sendToTopic(`c-${course.id}-live`, {
        title: '🔴 بدأ البث المباشر',
        body: `${course.title} · الدرس ${toArabicDigits(number)}`,
        data: { kind: 'live', courseId: course.id, number: String(number) },
      });
    } else {
      await fcm.sendToTopic('live-other', {
        title: '🔴 بث مباشر الآن',
        body: 'دروس الشيخ عبد الرزاق البدر',
        data: { kind: 'live-other', number: '' },
      });
    }
  } catch (e) {
    console.error('live push failed', e);
  }
}
