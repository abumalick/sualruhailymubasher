import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => void store.set(key, value),
    remove: async ({ key }: { key: string }) => void store.delete(key),
    keys: async () => ({ keys: [...store.keys()] }),
  },
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } }));
const fm = vi.hoisted(() => ({
  requestPermissions: vi.fn(async () => ({ receive: 'granted' })),
  checkPermissions: vi.fn(async () => ({ receive: 'granted' })),
  createChannel: vi.fn(async () => {}),
  subscribeToTopic: vi.fn(async (_: { topic: string }) => {}),
  unsubscribeFromTopic: vi.fn(async (_: { topic: string }) => {}),
  addListener: vi.fn(async () => ({ remove: async () => {} })),
  getDeliveredNotifications: vi.fn(async () => ({ notifications: [] as { id: string; tag?: string }[] })),
  removeDeliveredNotifications: vi.fn(async (_: { notifications: unknown[] }) => {}),
}));

vi.mock('../src/router', async (actual) => {
  const router = await actual<typeof import('../src/router')>();
  return { ...router, replaceRoute: vi.fn(router.replaceRoute) };
});
vi.mock('@capacitor-firebase/messaging', () => ({ FirebaseMessaging: fm, Importance: { High: 4 } }));
const st = vi.hoisted(() => ({
  fresh: [] as ((s: unknown) => void)[],
  data: { state: null, prefs: null } as { state: unknown; prefs: unknown },
  dataListeners: [] as ((d: unknown) => void)[],
}));
const requestLive = vi.hoisted(() => vi.fn());
const markTapped = vi.hoisted(() => vi.fn());
vi.mock('../src/store', () => ({
  requestLive,
  markTapped,
  watchFreshState: (cb: (s: unknown) => void) => {
    st.fresh.push(cb);
    return () => {};
  },
  currentData: () => st.data,
  currentState: () => st.data.state,
  watchData: (cb: (d: unknown) => void) => {
    st.dataListeners.push(cb);
    return () => {};
  },
}));
const setData = (d: { state: unknown; prefs: unknown }) => {
  st.data = d;
  st.dataListeners.forEach((cb) => cb(d));
};
const fetched = (s: unknown) => {
  setData({ ...st.data, state: s });
  st.fresh.forEach((cb) => cb(s));
};

import { FIXTURE_STATE } from '../src/dev/fixture-state';
import type { Prefs } from '../src/logic/prefs';
import { topicsFor } from '../src/logic/topics';
import { initPush, syncTopics } from '../src/push';
import { replaceRoute } from '../src/router';
import { Notifications } from '../src/ui/Notifications';

const ids = FIXTURE_STATE.courses.map((c) => c.id);
const known: Prefs['known'] = [['kitab-tawhid', 'fajr'], ['kabair', 'asr']];
const prefs = (wanted: string[]): Prefs => ({ wanted, known });
const unsubscribed = () => fm.unsubscribeFromTopic.mock.calls.map((c) => c[0].topic);
const subscribed = () => fm.subscribeToTopic.mock.calls.map((c) => c[0].topic);

beforeEach(() => {
  st.fresh = [];
  st.data = { state: null, prefs: null };
  st.dataListeners = [];
  store.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('syncTopics', () => {
  it('never asks permission, creates the channel, subscribes what is wanted and records what FCM accepted', async () => {
    fm.checkPermissions.mockResolvedValue({ receive: 'prompt' });
    expect(await syncTopics(FIXTURE_STATE, prefs(topicsFor(ids)))).toBe(true);
    fm.checkPermissions.mockResolvedValue({ receive: 'granted' });
    expect(fm.requestPermissions).not.toHaveBeenCalled();
    expect(fm.createChannel).toHaveBeenCalledWith({ id: 'lessons', name: 'الدروس', importance: 4 });
    expect(subscribed()).toHaveLength(ids.length * 3 + 1);
    expect(JSON.parse(store.get('topics')!)).toHaveLength(ids.length * 3 + 1);
  });

  it('resubscribes every wanted topic and drops the rest (restored backup, fresh FCM instance)', async () => {
    store.set('topics', JSON.stringify(topicsFor(ids)));
    await syncTopics(FIXTURE_STATE, prefs([`c-${ids[0]}-live`, 'live-other']));
    expect(subscribed().sort()).toEqual([`c-${ids[0]}-live`, 'live-other']);
    expect(unsubscribed()).toContain(`c-${ids[1]}-rec`);
    expect(JSON.parse(store.get('topics')!).sort()).toEqual([`c-${ids[0]}-live`, 'live-other']);
  });

  it('a lesson with every switch off is unsubscribed from all its topics', async () => {
    await syncTopics(FIXTURE_STATE, prefs([...topicsFor([ids[0]])]));
    expect(unsubscribed()).toEqual(expect.arrayContaining([`c-${ids[1]}-live`, `c-${ids[1]}-rec`, `c-${ids[1]}-prep`]));
  });

  it('a wanted topic of an unlisted course waits until the course is listed again', async () => {
    const p = prefs([`c-${ids[1]}-live`]);
    await syncTopics({ ...FIXTURE_STATE, courses: FIXTURE_STATE.courses.slice(0, 1) }, p);
    expect(subscribed()).not.toContain(`c-${ids[1]}-live`);
    await syncTopics(FIXTURE_STATE, p);
    expect(subscribed()).toContain(`c-${ids[1]}-live`);
  });

  it('a failed subscribe reports failure, keeps it out of the accepted list, and the next sync retries it', async () => {
    fm.subscribeToTopic.mockImplementation(async ({ topic }) => {
      if (topic === `c-${ids[1]}-rec`) throw new Error('offline');
    });
    expect(await syncTopics(FIXTURE_STATE, prefs(topicsFor(ids)))).toBe(false);
    expect(JSON.parse(store.get('topics')!)).not.toContain(`c-${ids[1]}-rec`);
    fm.subscribeToTopic.mockImplementation(async () => {});
    vi.clearAllMocks();
    expect(await syncTopics(FIXTURE_STATE, prefs(topicsFor(ids)))).toBe(true);
    expect(subscribed()).toContain(`c-${ids[1]}-rec`);
  });

  it('recreates the channel on every launch', async () => {
    await syncTopics(FIXTURE_STATE, prefs([]));
    await syncTopics(FIXTURE_STATE, prefs([]));
    expect(fm.createChannel).toHaveBeenCalledTimes(2);
  });
});

describe('Notifications screen', () => {
  it('lists every lesson, even one with every switch off, with its reminder times', async () => {
    render(<Notifications state={FIXTURE_STATE} prefs={prefs([...topicsFor([ids[0]])])} onToggle={() => {}} />);
    await waitFor(() => screen.getAllByRole('switch'));
    expect(screen.getByText('مساء اليوم السابق · ٩:٠٠ م')).toBeTruthy();
    expect(screen.getByText('قبل الدرس بثلاث ساعات')).toBeTruthy();
    const live = screen.getAllByRole('switch', { name: 'بدء البث المباشر' });
    expect(live.map((sw) => sw.getAttribute('aria-checked'))).toEqual(['true', 'false', 'true']);
  });

  it('a switch reports the topic and its new value', async () => {
    const onToggle = vi.fn();
    render(<Notifications state={FIXTURE_STATE} prefs={prefs(topicsFor(ids))} onToggle={onToggle} />);
    fireEvent.click((await screen.findAllByRole('switch', { name: 'بدء البث المباشر' }))[1]);
    expect(onToggle).toHaveBeenCalledWith(`c-${ids[1]}-live`, false);
  });

  it('explains when system notifications are off', async () => {
    fm.checkPermissions.mockResolvedValueOnce({ receive: 'denied' });
    render(<Notifications state={FIXTURE_STATE} prefs={prefs([])} onToggle={() => {}} />);
    await waitFor(() => screen.getByText(/متوقفة من إعدادات الجهاز/));
  });

  it('asks permission only on tap', async () => {
    fm.checkPermissions.mockResolvedValue({ receive: 'prompt' });
    render(<Notifications state={FIXTURE_STATE} prefs={prefs([])} onToggle={() => {}} />);
    expect(fm.requestPermissions).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'فعّل التنبيهات' }));
    await waitFor(() => expect(fm.requestPermissions).toHaveBeenCalledOnce());
    fm.checkPermissions.mockResolvedValue({ receive: 'granted' });
  });
});

describe('initPush', () => {
  const delivered = [
    { id: '0', tag: 'live' },
    { id: '0', tag: 'notice' },
    { id: '7', tag: 'media' },
    { id: 'live' },
  ];
  const withLive = (isLive: boolean) => ({ ...FIXTURE_STATE, live: { ...FIXTURE_STATE.live, isLive } });
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('removes only the live notification when a fresh state says nothing is live', async () => {
    fm.getDeliveredNotifications.mockResolvedValue({ notifications: delivered });
    await initPush();
    fetched(withLive(false));
    await waitFor(() => expect(fm.removeDeliveredNotifications).toHaveBeenCalledOnce());
    expect(fm.removeDeliveredNotifications).toHaveBeenCalledWith({ notifications: [delivered[0], delivered[3]] });
  });

  it('ignores a cached not-live state and keeps the notification when the fresh state is live', async () => {
    fm.getDeliveredNotifications.mockResolvedValue({ notifications: delivered });
    const p = prefs(topicsFor(ids));
    st.data = { state: withLive(false), prefs: p };
    await initPush();
    setData({ state: withLive(false), prefs: p });
    fetched(withLive(true));
    await settle();
    expect(fm.getDeliveredNotifications).not.toHaveBeenCalled();
    fetched(withLive(false));
    await waitFor(() => expect(fm.removeDeliveredNotifications).toHaveBeenCalledOnce());
  });

  it('leaves the tray alone when no live notification is shown', async () => {
    fm.getDeliveredNotifications.mockResolvedValue({ notifications: delivered.slice(1, 3) });
    await initPush();
    fetched(withLive(false));
    await waitFor(() => expect(fm.getDeliveredNotifications).toHaveBeenCalled());
    await settle();
    expect(fm.removeDeliveredNotifications).not.toHaveBeenCalled();
  });
});

describe('initPush keeps the subscriptions in line with the record', () => {
  it('waits for a record, then re-syncs on every change', async () => {
    await initPush();
    setData({ state: FIXTURE_STATE, prefs: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(fm.subscribeToTopic).not.toHaveBeenCalled();
    setData({ state: FIXTURE_STATE, prefs: prefs([`c-${ids[0]}-live`]) });
    await waitFor(() => expect(JSON.parse(store.get('topics') ?? '[]')).toEqual([`c-${ids[0]}-live`]));
    setData({ state: FIXTURE_STATE, prefs: prefs([`c-${ids[1]}-live`]) });
    await waitFor(() => expect(JSON.parse(store.get('topics')!)).toEqual([`c-${ids[1]}-live`]));
  });

  it('retries a failed sync on the next update, without a restart', async () => {
    await initPush();
    fm.unsubscribeFromTopic.mockRejectedValueOnce(new Error('offline'));
    store.set('topics', JSON.stringify([`c-${ids[1]}-live`]));
    setData({ state: FIXTURE_STATE, prefs: prefs([`c-${ids[0]}-live`]) });
    await waitFor(() => expect(fm.unsubscribeFromTopic).toHaveBeenCalled());
    await waitFor(() => expect(JSON.parse(store.get('topics')!)).toContain(`c-${ids[1]}-live`));
    vi.clearAllMocks();
    setData(st.data as { state: unknown; prefs: unknown });
    await waitFor(() => expect(JSON.parse(store.get('topics')!)).toEqual([`c-${ids[0]}-live`]));
  });
});

describe('tapping a notification', () => {
  const tap = async (data: Record<string, string>) => {
    store.set('topics', '[]');
    setData({ state: FIXTURE_STATE, prefs: prefs(topicsFor(ids)) });
    await initPush();
    const call = (fm.addListener.mock.calls as unknown as [string, (e: unknown) => Promise<void>][]).find(([name]) => name === 'notificationActionPerformed')!;
    await call[1]({ notification: { data } });
  };

  it('a live notification asks for the player and opens its lesson', async () => {
    location.hash = '#/more';
    await tap({ kind: 'live', courseId: 'kabair', number: '3' });
    expect(requestLive).toHaveBeenCalledWith({ courseId: 'kabair' });
    expect(markTapped).toHaveBeenCalledOnce();
    expect(location.hash).toBe('#/course/kabair');
    expect(replaceRoute).not.toHaveBeenCalled();
  });

  it('a live-other notification asks for the player and stays on the current page', async () => {
    location.hash = '#/course/kitab-tawhid';
    await tap({ kind: 'live-other', number: '' });
    expect(requestLive).toHaveBeenCalledWith({ courseId: null });
    expect(location.hash).toBe('#/course/kitab-tawhid');
  });

  it('a live-other notification during the tour closes it, without leaving it in the history', async () => {
    location.hash = '#/welcome';
    await tap({ kind: 'live-other', number: '' });
    expect(requestLive).toHaveBeenCalledWith({ courseId: null });
    expect(replaceRoute).toHaveBeenCalledWith('#/');
    expect(location.hash).toBe('#/');
  });

  it('a recording notification asks for no player', async () => {
    await tap({ kind: 'rec', courseId: 'kitab-tawhid', number: '443' });
    expect(requestLive).not.toHaveBeenCalled();
    expect(location.hash).toBe('#/course/kitab-tawhid');
  });
});
