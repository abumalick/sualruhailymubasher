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
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
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

vi.mock('@capacitor-firebase/messaging', () => ({ FirebaseMessaging: fm, Importance: { High: 4 } }));
const st = vi.hoisted(() => ({
  state: null as unknown,
  listeners: [] as ((s: unknown) => void)[],
  fresh: [] as ((s: unknown) => void)[],
  data: { state: null, follow: null } as { state: unknown; follow: unknown },
  dataListeners: [] as ((d: unknown) => void)[],
}));
vi.mock('../src/store', () => ({
  watchFreshState: (cb: (s: unknown) => void) => {
    st.fresh.push(cb);
    return () => {};
  },
  currentState: () => st.state,
  currentData: () => st.data,
  currentView: () => st.data.state,
  watchData: (cb: (d: unknown) => void) => {
    st.dataListeners.push(cb);
    return () => {};
  },
  watchState: (cb: (s: unknown) => void) => {
    cb(st.state);
    st.listeners.push(cb);
  },
}));
const setState = (s: unknown) => {
  st.state = s;
  st.listeners.forEach((cb) => cb(s));
};
const setData = (d: { state: unknown; follow: unknown }) => {
  st.data = d;
  st.dataListeners.forEach((cb) => cb(d));
};
const fetched = (s: unknown) => {
  setState(s);
  st.fresh.forEach((cb) => cb(s));
};

import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { followOnly } from '../src/logic/follow';
import { initPush, setTopic, syncTopics } from '../src/push';
import { Notifications } from '../src/ui/Notifications';

const ids = FIXTURE_STATE.courses.map((c) => c.id);
const subscribed = () => fm.subscribeToTopic.mock.calls.map((c) => c[0].topic);

beforeEach(() => {
  st.state = null;
  st.listeners = [];
  st.fresh = [];
  st.data = { state: null, follow: null };
  st.dataListeners = [];
  store.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('syncTopics', () => {
  it('first sync never asks permission cold, creates the channel, subscribes to everything and persists', async () => {
    fm.checkPermissions.mockResolvedValue({ receive: 'prompt' });
    await syncTopics(FIXTURE_STATE, ids);
    fm.checkPermissions.mockResolvedValue({ receive: 'granted' });
    expect(fm.requestPermissions).not.toHaveBeenCalled();
    expect(fm.createChannel).toHaveBeenCalledWith({ id: 'lessons', name: 'الدروس', importance: 4 });
    expect(subscribed()).toHaveLength(ids.length * 3 + 1);
    expect(JSON.parse(store.get('topics')!)).toHaveLength(ids.length * 3 + 1);
  });

  it('later launches do not ask again and add a new course', async () => {
    await syncTopics({ ...FIXTURE_STATE, courses: FIXTURE_STATE.courses.slice(0, 1) }, ids);
    vi.clearAllMocks();
    await syncTopics(FIXTURE_STATE, ids);
    expect(fm.requestPermissions).not.toHaveBeenCalled();
    expect(subscribed()).toEqual(expect.arrayContaining([`c-${ids[1]}-live`, `c-${ids[1]}-prep`, `c-${ids[1]}-rec`]));
    expect(JSON.parse(store.get('topics')!)).toHaveLength(ids.length * 3 + 1);
  });

  it('resubscribes every stored topic on launch (restored backup, fresh FCM instance)', async () => {
    store.set('topics', JSON.stringify([`c-${ids[0]}-live`, 'live-other']));
    store.set('topic-courses', JSON.stringify(ids));
    await syncTopics(FIXTURE_STATE, ids);
    expect(subscribed().sort()).toEqual([`c-${ids[0]}-live`, 'live-other']);
    expect(fm.unsubscribeFromTopic.mock.calls.map((c) => c[0].topic)).toContain(`c-${ids[1]}-rec`);
  });

  it('recreates the channel on every launch', async () => {
    await syncTopics(FIXTURE_STATE, ids);
    await syncTopics(FIXTURE_STATE, ids);
    expect(fm.createChannel).toHaveBeenCalledTimes(2);
  });

  it('a failed first launch persists nothing so it retries whole', async () => {
    fm.subscribeToTopic.mockRejectedValueOnce(new Error('offline'));
    await syncTopics(FIXTURE_STATE, ids);
    expect(store.has('topics')).toBe(false);
  });

  it('keeps a topic the user turned off across launches', async () => {
    await syncTopics(FIXTURE_STATE, ids);
    await setTopic(`c-${ids[1]}-live`, false);
    vi.clearAllMocks();
    await syncTopics(FIXTURE_STATE, ids);
    expect(subscribed()).toHaveLength(ids.length * 3);
    expect(subscribed()).not.toContain(`c-${ids[1]}-live`);
    expect(fm.unsubscribeFromTopic).toHaveBeenCalledWith({ topic: `c-${ids[1]}-live` });
  });
});

describe('setTopic before the first sync', () => {
  it('keeps the other defaults and the opt-out when the first sync runs later', async () => {
    store.set('state', JSON.stringify(FIXTURE_STATE));
    await setTopic(`c-${ids[0]}-rec`, false);
    expect(JSON.parse(store.get('topics')!)).not.toContain(`c-${ids[0]}-rec`);
    expect(JSON.parse(store.get('topics')!)).toHaveLength(ids.length * 3);
    expect(JSON.parse(store.get('topic-courses')!)).toEqual(ids);
    vi.clearAllMocks();
    await syncTopics(FIXTURE_STATE, ids);
    expect(subscribed()).toHaveLength(ids.length * 3);
    expect(subscribed()).not.toContain(`c-${ids[0]}-rec`);
  });

  it('serializes concurrent writes so none is lost', async () => {
    await syncTopics(FIXTURE_STATE, ids);
    await Promise.all([setTopic(`c-${ids[0]}-rec`, false), setTopic(`c-${ids[1]}-rec`, false)]);
    const saved = JSON.parse(store.get('topics')!);
    expect(saved).not.toContain(`c-${ids[0]}-rec`);
    expect(saved).not.toContain(`c-${ids[1]}-rec`);
  });
});

describe('Notifications screen', () => {
  it('shows every default switch on before the first sync', async () => {
    render(<Notifications state={FIXTURE_STATE} />);
    await waitFor(() => screen.getAllByRole('switch'));
    screen.getAllByRole('switch').forEach((sw) => expect(sw.getAttribute('aria-checked')).toBe('true'));
  });

  it('shows per-course toggles and unsubscribes when switched off', async () => {
    await syncTopics(FIXTURE_STATE, ids);
    vi.clearAllMocks();
    render(<Notifications state={FIXTURE_STATE} />);
    await waitFor(() => screen.getAllByText('مساء اليوم السابق · ٩:٠٠ م'));
    expect(screen.getByText('عصر يوم الدرس · ٣:٣٠ م')).toBeTruthy();
    expect(screen.getByText('بث مباشر آخر')).toBeTruthy();
    const live = screen.getAllByRole('switch', { name: 'بدء البث المباشر' });
    expect(live).toHaveLength(ids.length + 1);
    fireEvent.click(live[1]);
    await waitFor(() => expect(fm.unsubscribeFromTopic).toHaveBeenCalledWith({ topic: `c-${ids[1]}-live` }));
    await waitFor(() => expect(live[1].getAttribute('aria-checked')).toBe('false'));
  });

  it('explains when system notifications are off', async () => {
    fm.checkPermissions.mockResolvedValueOnce({ receive: 'denied' });
    render(<Notifications state={FIXTURE_STATE} />);
    await waitFor(() => screen.getByText(/متوقفة من إعدادات الجهاز/));
  });
});

describe('setTopic without any state', () => {
  it('does nothing and reports it', async () => {
    expect(await setTopic('live-other', false)).toBeNull();
    expect(fm.subscribeToTopic).not.toHaveBeenCalled();
    expect(store.has('topics')).toBe(false);
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
    st.state = withLive(false);
    await initPush();
    setState(withLive(false));
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

describe('topics follow the course choice', () => {
  const unsubscribed = () => fm.unsubscribeFromTopic.mock.calls.map((c) => c[0].topic);

  it('a one-course listener gets only that course and the other broadcasts', async () => {
    await syncTopics(FIXTURE_STATE, [ids[0]]);
    expect(subscribed().sort()).toEqual([`c-${ids[0]}-live`, `c-${ids[0]}-prep`, `c-${ids[0]}-rec`, 'live-other']);
    expect(unsubscribed()).toEqual(expect.arrayContaining([`c-${ids[1]}-live`, `c-${ids[1]}-rec`, `c-${ids[1]}-prep`]));
    expect(JSON.parse(store.get('topic-courses')!)).toEqual([ids[0]]);
  });

  it('switching course moves every subscription at once and keeps live-other', async () => {
    await syncTopics(FIXTURE_STATE, ids);
    await setTopic('live-other', false);
    vi.clearAllMocks();
    await syncTopics(FIXTURE_STATE, [ids[1]]);
    expect(unsubscribed()).toEqual(expect.arrayContaining([`c-${ids[0]}-live`, `c-${ids[0]}-rec`, `c-${ids[0]}-prep`]));
    expect(JSON.parse(store.get('topics')!).sort()).toEqual([`c-${ids[1]}-live`, `c-${ids[1]}-prep`, `c-${ids[1]}-rec`]);
  });

  it('a sync that fails while dropping a course still lets it come back with its defaults', async () => {
    await syncTopics(FIXTURE_STATE, ids);
    fm.subscribeToTopic.mockRejectedValueOnce(new Error('offline'));
    await syncTopics(FIXTURE_STATE, [ids[0]]);
    expect(JSON.parse(store.get('topic-courses')!)).toEqual([ids[0]]);
    vi.clearAllMocks();
    await syncTopics(FIXTURE_STATE, ids);
    expect(subscribed()).toEqual(expect.arrayContaining([`c-${ids[1]}-live`, `c-${ids[1]}-rec`, `c-${ids[1]}-prep`]));
  });

  it('a newly followed course whose subscribe fails is retried with its defaults', async () => {
    await syncTopics(FIXTURE_STATE, [ids[0]]);
    fm.subscribeToTopic.mockImplementation(async ({ topic }) => {
      if (topic === `c-${ids[1]}-rec`) throw new Error('offline');
    });
    expect(await syncTopics(FIXTURE_STATE, ids)).toBe(false);
    expect(JSON.parse(store.get('topic-courses')!)).toEqual([ids[0]]);
    fm.subscribeToTopic.mockImplementation(async () => {});
    vi.clearAllMocks();
    expect(await syncTopics(FIXTURE_STATE, ids)).toBe(true);
    expect(subscribed()).toContain(`c-${ids[1]}-rec`);
  });

  const follow = (list: string[]) => ({ state: FIXTURE_STATE, follow: followOnly(FIXTURE_STATE.courses, list) });

  it('initPush retries a failed sync on the next update, without a restart', async () => {
    await initPush();
    setData(follow(ids));
    await waitFor(() => expect(store.get('topics')).toBeTruthy());
    fm.unsubscribeFromTopic.mockRejectedValueOnce(new Error('offline'));
    setData(follow([ids[0]]));
    await waitFor(() => expect(fm.unsubscribeFromTopic).toHaveBeenCalled());
    await waitFor(() => expect(JSON.parse(store.get('topics')!)).toContain(`c-${ids[1]}-live`));
    vi.clearAllMocks();
    setData(st.data);
    await waitFor(() => expect(fm.unsubscribeFromTopic).toHaveBeenCalledWith({ topic: `c-${ids[1]}-live` }));
    await waitFor(() => expect(JSON.parse(store.get('topics')!)).not.toContain(`c-${ids[1]}-live`));
    expect(fm.subscribeToTopic).toHaveBeenCalled();
  });

  it('initPush waits for the first choice, then re-syncs on every change', async () => {
    await initPush();
    setData({ state: FIXTURE_STATE, follow: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(fm.subscribeToTopic).not.toHaveBeenCalled();
    setData(follow([ids[0]]));
    await waitFor(() => expect(JSON.parse(store.get('topics') ?? '[]')).toContain(`c-${ids[0]}-live`));
    expect(subscribed()).not.toContain(`c-${ids[1]}-live`);
    setData(follow([ids[1]]));
    await waitFor(() => expect(JSON.parse(store.get('topics')!)).toContain(`c-${ids[1]}-live`));
    expect(JSON.parse(store.get('topics')!)).not.toContain(`c-${ids[0]}-live`);
  });
});

describe('Notifications screen with a choice', () => {
  it('lists only followed courses and asks permission only on tap', async () => {
    fm.checkPermissions.mockResolvedValue({ receive: 'prompt' });
    const view = { ...FIXTURE_STATE, courses: FIXTURE_STATE.courses.slice(0, 1) };
    render(<Notifications state={view} />);
    await waitFor(() => screen.getAllByRole('switch'));
    expect(screen.getAllByRole('switch', { name: 'بدء البث المباشر' })).toHaveLength(2);
    expect(fm.requestPermissions).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'فعّل التنبيهات' }));
    await waitFor(() => expect(fm.requestPermissions).toHaveBeenCalledOnce());
    fm.checkPermissions.mockResolvedValue({ receive: 'granted' });
  });
});
