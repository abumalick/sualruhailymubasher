import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { FirebaseMessaging, Importance } from '@capacitor-firebase/messaging';
import { LIVE_TAG, type PushData, type StateDTO } from '@albadr/shared';
import { routeForPush } from './logic/topics';
import { subscriptionPlan, type Prefs } from './logic/prefs';
import { navigate } from './router';
import { currentData, currentState, markTapped, requestLive, watchData, watchFreshState, type AppData } from './store';
import { loadCachedState } from './api';

const TOPICS_KEY = 'topics';
const KINDS = ['live', 'live-other', 'rec', 'prep'];

const native = () => Capacitor.isNativePlatform();

async function loadSubscribed(): Promise<string[]> {
  const { value } = await Preferences.get({ key: TOPICS_KEY });
  if (!value) return [];
  try {
    const list = JSON.parse(value);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
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

async function prepareNotifications() {
  try {
    await FirebaseMessaging.createChannel({ id: 'lessons', name: 'الدروس', importance: Importance.High });
  } catch {}
}

// The record says what is wanted; `topics` keeps what FCM accepted, so a failure is retried on the next sync.
export const syncTopics = (state: StateDTO, prefs: Prefs): Promise<boolean> =>
  serial(async () => {
    if (native()) await prepareNotifications();
    const subscribed = await loadSubscribed();
    const plan = subscriptionPlan(prefs, state.courses.map((c) => c.id), subscribed);
    const { topics, failed } = await apply(subscribed, plan);
    await Preferences.set({ key: TOPICS_KEY, value: JSON.stringify(topics) });
    return !failed;
  });

export async function askPermission(): Promise<string> {
  if (!native()) return 'granted';
  try {
    return (await FirebaseMessaging.requestPermissions()).receive;
  } catch {
    return pushPermission();
  }
}

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
    markTapped();
    if (data.kind === 'live' || data.kind === 'live-other') requestLive({ courseId: data.kind === 'live' ? (data.courseId ?? null) : null });
    const route = routeForPush(data, currentState() ?? (await loadCachedState()));
    if (route) navigate(route);
  });
  watchFreshState((state) => {
    if (!state.live.isLive) void clearLiveNotification();
  });
  let synced = '';
  const sync = ({ state, prefs }: AppData) => {
    if (!state || !prefs) return;
    const key = `${prefs.wanted.join(',')}|${state.courses.map((c) => c.id).join(',')}`;
    if (key === synced) return;
    synced = key;
    const retry = () => {
      if (synced === key) synced = '';
    };
    syncTopics(state, prefs).then((ok) => ok || retry(), retry);
  };
  sync(currentData());
  watchData(sync);
}
