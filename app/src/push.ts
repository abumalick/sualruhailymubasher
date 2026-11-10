import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { FirebaseMessaging, Importance } from '@capacitor-firebase/messaging';
import { LIVE_TAG, type PushData, type StateDTO } from '@albadr/shared';
import { diffTopics, launchTopics, routeForPush, topicsFor, type StoredTopics } from './logic/topics';
import { navigate } from './router';
import { currentState, watchFreshState, watchState } from './store';
import { loadCachedState } from './api';

const TOPICS_KEY = 'topics';
const COURSES_KEY = 'topic-courses';
const KINDS = ['live', 'live-other', 'rec', 'prep'];

const native = () => Capacitor.isNativePlatform();

async function readList(key: string): Promise<string[] | null> {
  const { value } = await Preferences.get({ key });
  if (!value) return null;
  try {
    const list = JSON.parse(value);
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

async function loadStored(): Promise<StoredTopics | null> {
  const topics = await readList(TOPICS_KEY);
  if (!topics) return null;
  return { topics, courses: (await readList(COURSES_KEY)) ?? [] };
}

export async function loadTopics(state: StateDTO | null): Promise<string[]> {
  const stored = await loadStored();
  if (stored) return stored.topics;
  return state ? topicsFor(state.courses.map((c) => c.id)) : [];
}

let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
};

async function apply(current: string[], { sub, unsub }: { sub: string[]; unsub: string[] }): Promise<{ topics: string[]; failed: boolean }> {
  const topics = new Set(current);
  let failed = false;
  if (native()) {
    for (const topic of sub) {
      try {
        await FirebaseMessaging.subscribeToTopic({ topic });
        topics.add(topic);
      } catch {
        failed = true;
      }
    }
    for (const topic of unsub) {
      try {
        await FirebaseMessaging.unsubscribeFromTopic({ topic });
        topics.delete(topic);
      } catch {
        failed = true;
      }
    }
  } else {
    sub.forEach((t) => topics.add(t));
    unsub.forEach((t) => topics.delete(t));
  }
  return { topics: [...topics], failed };
}

async function save(topics: string[], courses?: string[]) {
  await Preferences.set({ key: TOPICS_KEY, value: JSON.stringify(topics) });
  if (courses) await Preferences.set({ key: COURSES_KEY, value: JSON.stringify(courses) });
}

export const setTopic = (topic: string, on: boolean): Promise<string[] | null> =>
  serial(async () => {
    const stored = await loadStored();
    const toggle = (list: string[]) => (on ? [...new Set([...list, topic])] : list.filter((t) => t !== topic));
    if (stored) {
      const { topics } = await apply(stored.topics, diffTopics(stored.topics, toggle(stored.topics)));
      await save(topics);
      return topics;
    }
    const state = currentState() ?? (await loadCachedState());
    if (!state) return null;
    const ids = state.courses.map((c) => c.id);
    const defaults = topicsFor(ids);
    const { topics, failed } = await apply([], diffTopics([], toggle(defaults)));
    if (failed) return defaults;
    await save(topics, ids);
    return topics;
  });

async function prepareNotifications() {
  try {
    const { receive } = await FirebaseMessaging.checkPermissions();
    if (receive.startsWith('prompt')) await FirebaseMessaging.requestPermissions();
  } catch {}
  try {
    await FirebaseMessaging.createChannel({ id: 'lessons', name: 'الدروس', importance: Importance.High });
  } catch {}
}

export const syncTopics = (state: StateDTO): Promise<void> =>
  serial(async () => {
    if (native()) await prepareNotifications();
    const stored = await loadStored();
    const ids = state.courses.map((c) => c.id);
    const current = stored?.topics ?? [];
    const wanted = launchTopics(stored, ids);
    const unsub = [...new Set([...current, ...topicsFor(ids)])].filter((t) => !wanted.includes(t));
    const { topics, failed } = await apply(current, { sub: wanted, unsub });
    if (failed && !stored) return;
    await save(topics, failed ? undefined : ids);
  });

export async function pushPermission(): Promise<string> {
  if (!native()) return 'granted';
  try {
    return (await FirebaseMessaging.checkPermissions()).receive;
  } catch {
    return 'granted';
  }
}

const isPushData = (d: unknown): d is PushData =>
  typeof d === 'object' && d !== null && KINDS.includes((d as PushData).kind);

// Fallback for a dismiss push that was delayed or never arrived (iOS throttles background pushes).
// Android tags it; iOS uses the collapse id as the notification's identifier.
async function clearLiveNotification(): Promise<void> {
  try {
    const { notifications } = await FirebaseMessaging.getDeliveredNotifications();
    const live = notifications.filter((n) => n.tag === LIVE_TAG || n.id === LIVE_TAG);
    if (live.length) await FirebaseMessaging.removeDeliveredNotifications({ notifications: live });
  } catch {}
}

export async function initPush(): Promise<void> {
  if (!native()) return;
  await FirebaseMessaging.addListener('notificationActionPerformed', async (event) => {
    const data = event.notification.data;
    if (!isPushData(data)) return;
    navigate(routeForPush(data, currentState() ?? (await loadCachedState())));
  });
  let synced = false;
  watchFreshState((state) => {
    if (!state.live.isLive) void clearLiveNotification();
  });
  watchState((state) => {
    if (synced || !state) return;
    synced = true;
    void syncTopics(state);
  });
}
