import { cleanup, render, screen } from '@testing-library/preact';
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
vi.mock('../src/api', () => ({ API_BASE: '', loadCachedState: vi.fn(), fetchState: vi.fn(), fetchLessons: vi.fn(async () => []) }));
const platform = vi.hoisted(() => ({ native: false }));
vi.mock('../src/platform', () => ({ isNative: () => platform.native, nativeUI: () => platform.native }));
vi.mock('../src/push', () => ({
  askPermission: vi.fn(async () => 'granted'),
  pushPermission: vi.fn(async () => (platform.native ? 'prompt' : 'granted')),
  loadTopics: vi.fn(async () => []),
  setTopic: vi.fn(),
}));

import * as api from '../src/api';
import { App } from '../src/App';
import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { seedPrefs } from './seed';
import { About } from '../src/ui/About';

const tabLabels = () => [...document.querySelectorAll('.nav a')].map((a) => a.textContent);

async function app(hash: string) {
  location.hash = hash;
  seedPrefs(store, FIXTURE_STATE.courses);
  vi.mocked(api.loadCachedState).mockResolvedValue(FIXTURE_STATE);
  vi.mocked(api.fetchState).mockResolvedValue({ state: FIXTURE_STATE, fresh: true });
  render(<App />);
  await screen.findAllByText('المزيد');
}

beforeEach(() => {
  store.clear();
  platform.native = false;
});
afterEach(() => {
  cleanup();
  location.hash = '';
});

describe('About', () => {
  it('says the app is unofficial and names its sources, with links', () => {
    render(<About native={true} />);
    expect(screen.getByText(/هذا تطبيق غير رسمي من إعداد طلاب العلم، ولا يتبع الشيخ ولا موقعه/)).toBeTruthy();
    const href = (name: RegExp) => screen.getByRole('link', { name }).getAttribute('href');
    expect(href(/موقع الشيخ/)).toBe('https://al-badr.net');
    expect(href(/Mixlr/)).toBe('https://albadrnet.mixlr.com');
    expect(href(/سياسة الخصوصية/)).toBe('https://albadrmubasher.com/privacy');
    expect(href(/تواصل معنا/)).toBe('mailto:contact@albadrmubasher.com');
    expect(screen.getByText('البدر مباشر')).toBeTruthy();
  });

  it('never calls itself official', () => {
    const { container } = render(<About native={false} />);
    expect(container.textContent!.replace(/غير رسمي/g, '')).not.toMatch(/رسمي/);
  });

  it('in the mobile app it shows no store links and no web note', () => {
    render(<About native={true} />);
    expect(screen.queryByText('تطبيق الجوال')).toBeNull();
    expect(screen.queryByText(/Google Play/)).toBeNull();
  });

  it('on the web it points to the mobile apps for notifications, with placeholders until the stores list them', () => {
    render(<About native={false} />);
    expect(screen.getByText(/لا تتوفر التنبيهات في نسخة المتصفح/)).toBeTruthy();
    expect(screen.getByText('Google Play · قريبًا')).toBeTruthy();
    expect(screen.getByText('App Store · قريبًا')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Google Play|App Store/ })).toBeNull();
    expect(screen.getByRole('link', { name: /سياسة الخصوصية/ }).getAttribute('href')).toBe('/privacy');
  });
});

describe('App on the web', () => {
  it('shows one tab per lesson and المزيد, which leaves out notifications', async () => {
    await app('#/more');
    expect(tabLabels()).toEqual(['الفجر', 'المغرب', 'المزيد']);
    expect(screen.queryByRole('link', { name: /التنبيهات/ })).toBeNull();
  });

  it('an old #/notifications link shows the About page, never the toggles', async () => {
    await app('#/notifications');
    await screen.findByText(/لا تتوفر التنبيهات في نسخة المتصفح/);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(document.querySelector('.nav a.on')!.textContent).toBe('المزيد');
  });

  it('#/about opens the About page with a way back to المزيد', async () => {
    await app('#/about');
    await screen.findByText(/هذا تطبيق غير رسمي/);
    expect(document.documentElement.classList.contains('web')).toBe(true);
    expect(screen.getByRole('link', { name: 'رجوع' }).getAttribute('href')).toBe('#/more');
  });
});

describe('App in the mobile app', () => {
  beforeEach(() => {
    platform.native = true;
  });

  it('reaches notifications from المزيد', async () => {
    await app('#/more');
    expect(tabLabels()).toEqual(['الفجر', 'المغرب', 'المزيد']);
    expect(screen.getByRole('link', { name: /التنبيهات/ }).getAttribute('href')).toBe('#/notifications');
    cleanup();
    await app('#/notifications');
    await screen.findByText('اختر ما يصلك من كل درس');
    expect(document.querySelector('.nav a.on')!.textContent).toBe('المزيد');
  });

  it('reaches About from المزيد, with a way back', async () => {
    await app('#/about');
    await screen.findByText(/هذا تطبيق غير رسمي/);
    expect(document.querySelector('.nav a.on')!.textContent).toBe('المزيد');
    expect(document.documentElement.classList.contains('web')).toBe(false);
    expect(screen.getByRole('link', { name: 'رجوع' }).getAttribute('href')).toBe('#/more');
  });
});
