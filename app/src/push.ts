import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { FirebaseMessaging, Importance } from '@capacitor-firebase/messaging';
import type { PushData, StateDTO } from '@albadr/shared';
import { diffTopics, launchTopics, routeForPush, type StoredTopics } from './logic/topics';
import { navigate } from './router';
import { currentState, watchState } from './store';
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

export const loadTopics = async (): Promise<string[]> => (await loadStored())?.topics ?? [];

async function apply(current: string[], wanted: string[]): Promise<{ topics: string[]; failed: boolean }> {
  const { sub, unsub } = diffTopics(current, wanted);
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

export async function setTopic(topic: string, on: boolean): Promise<string[]> {
  const stored = await loadStored();
  const current = stored?.topics ?? [];
  const wanted = on ? [...current, topic] : current.filter((t) => t !== topic);
  const { topics } = await apply(current, wanted);
  await save(topics);
  return topics;
}

export async function syncTopics(state: StateDTO): Promise<void> {
  const stored = await loadStored();
  const ids = state.courses.map((c) => c.id);
  if (!stored && native()) {
    try {
      await FirebaseMessaging.requestPermissions();
    } catch {}
    try {
      await FirebaseMessaging.createChannel({ id: 'lessons', name: 'الدروس', importance: Importance.High });
    } catch {}
  }
  const { topics, failed } = await apply(stored?.topics ?? [], launchTopics(stored, ids));
  if (failed && !stored) return;
  await save(topics, failed ? undefined : ids);
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

export async function initPush(): Promise<void> {
  if (!native()) return;
  await FirebaseMessaging.addListener('notificationActionPerformed', async (event) => {
    const data = event.notification.data;
    if (!isPushData(data)) return;
    navigate(routeForPush(data, currentState() ?? (await loadCachedState())));
  });
  let synced = false;
  watchState((state) => {
    if (synced || !state) return;
    synced = true;
    void syncTopics(state);
  });
}
