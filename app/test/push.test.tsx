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
}));
vi.mock('@capacitor-firebase/messaging', () => ({ FirebaseMessaging: fm, Importance: { High: 4 } }));

import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { setTopic, syncTopics } from '../src/push';
import { Notifications } from '../src/ui/Notifications';

const ids = FIXTURE_STATE.courses.map((c) => c.id);
const subscribed = () => fm.subscribeToTopic.mock.calls.map((c) => c[0].topic);

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('syncTopics', () => {
  it('first launch asks permission, creates the channel, subscribes to everything and persists', async () => {
    fm.checkPermissions.mockResolvedValueOnce({ receive: 'prompt' });
    await syncTopics(FIXTURE_STATE);
    expect(fm.requestPermissions).toHaveBeenCalledOnce();
    expect(fm.createChannel).toHaveBeenCalledWith({ id: 'lessons', name: 'الدروس', importance: 4 });
    expect(subscribed()).toHaveLength(ids.length * 3 + 1);
    expect(JSON.parse(store.get('topics')!)).toHaveLength(ids.length * 3 + 1);
  });

  it('later launches do not ask again and only add a new course', async () => {
    await syncTopics({ ...FIXTURE_STATE, courses: FIXTURE_STATE.courses.slice(0, 1) });
    vi.clearAllMocks();
    await syncTopics(FIXTURE_STATE);
    expect(fm.requestPermissions).not.toHaveBeenCalled();
    expect(subscribed().sort()).toEqual([`c-${ids[1]}-live`, `c-${ids[1]}-prep`, `c-${ids[1]}-rec`]);
  });

  it('recreates the channel on every launch', async () => {
    await syncTopics(FIXTURE_STATE);
    await syncTopics(FIXTURE_STATE);
    expect(fm.createChannel).toHaveBeenCalledTimes(2);
  });

  it('a failed first launch persists nothing so it retries whole', async () => {
    fm.subscribeToTopic.mockRejectedValueOnce(new Error('offline'));
    await syncTopics(FIXTURE_STATE);
    expect(store.has('topics')).toBe(false);
  });

  it('keeps a topic the user turned off across launches', async () => {
    await syncTopics(FIXTURE_STATE);
    await setTopic(`c-${ids[1]}-live`, false);
    vi.clearAllMocks();
    await syncTopics(FIXTURE_STATE);
    expect(fm.subscribeToTopic).not.toHaveBeenCalled();
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
    await syncTopics(FIXTURE_STATE);
    expect(fm.subscribeToTopic).not.toHaveBeenCalled();
  });

  it('serializes concurrent writes so none is lost', async () => {
    await syncTopics(FIXTURE_STATE);
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
    await syncTopics(FIXTURE_STATE);
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
