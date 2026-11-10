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
import { followOnly } from '../src/logic/follow';
import { About } from '../src/ui/About';
import { Course } from '../src/ui/Course';
import { Links } from '../src/ui/Links';
import { tabs } from '../src/ui/NavBar';

const none = { read: new Set<string>(), reviewed: new Set<string>() };
const tabLabels = () => [...document.querySelectorAll('.nav a')].map((a) => a.textContent);

async function app(hash: string) {
  location.hash = hash;
  store.set('follow', JSON.stringify(followOnly(FIXTURE_STATE.courses, FIXTURE_STATE.courses.map((c) => c.id))));
  vi.mocked(api.loadCachedState).mockResolvedValue(FIXTURE_STATE);
  vi.mocked(api.fetchState).mockResolvedValue({ state: FIXTURE_STATE, fresh: true });
  render(<App />);
  await screen.findByText('الرئيسية');
}

beforeEach(() => {
  store.clear();
  platform.native = false;
});
afterEach(() => {
  cleanup();
  location.hash = '';
});

describe('tabs', () => {
  it('the mobile apps keep the notifications tab; the web shows عن التطبيق in its place', () => {
    expect(tabs(true).map((t) => t.label)).toEqual(['الرئيسية', 'الدروس', 'التنبيهات', 'روابط']);
    expect(tabs(false).map((t) => t.label)).toEqual(['الرئيسية', 'الدروس', 'عن التطبيق', 'روابط']);
    expect(tabs(false)[2].href).toBe('#/about');
  });
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
  it('shows عن التطبيق instead of the notifications tab', async () => {
    await app('#/');
    expect(tabLabels()).toEqual(['الرئيسية', 'الدروس', 'عن التطبيق', 'روابط']);
  });

  it('an old #/notifications link shows the About page, never the toggles', async () => {
    await app('#/notifications');
    await screen.findByText(/لا تتوفر التنبيهات في نسخة المتصفح/);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(document.querySelector('.nav a.on')!.textContent).toBe('عن التطبيق');
  });

  it('#/about opens the About page without a back button', async () => {
    await app('#/about');
    await screen.findByText(/هذا تطبيق غير رسمي/);
    expect(document.documentElement.classList.contains('web')).toBe(true);
    expect(screen.queryByRole('link', { name: 'رجوع' })).toBeNull();
  });

  it('the course chooser does not promise notifications', async () => {
    await app('#/follow');
    await screen.findByText('يتغيّر معها ما تراه');
    expect(document.body.textContent).not.toMatch(/تنبيه/);
  });
});

describe('App in the mobile app', () => {
  beforeEach(() => {
    platform.native = true;
  });

  it('keeps the notifications tab and screen', async () => {
    await app('#/notifications');
    expect(tabLabels()).toEqual(['الرئيسية', 'الدروس', 'التنبيهات', 'روابط']);
    await screen.findByText('اختر ما يصلك من كل درس تتابعه');
  });

  it('reaches About from روابط, with a way back', async () => {
    await app('#/about');
    await screen.findByText(/هذا تطبيق غير رسمي/);
    expect(document.querySelector('.nav a.on')!.textContent).toBe('روابط');
    expect(document.documentElement.classList.contains('web')).toBe(false);
    expect(screen.getByRole('link', { name: 'رجوع' }).getAttribute('href')).toBe('#/links');
  });

  it('the course chooser still mentions notifications', async () => {
    await app('#/follow');
    await screen.findByText('يتغيّر معها ما تراه وما يصلك من تنبيهات');
  });
});

describe('notification links outside the tab', () => {
  const course = FIXTURE_STATE.courses[0];

  it('the course page links to notifications only in the mobile app', () => {
    platform.native = true;
    const { unmount } = render(<Course course={course} ticks={none} onTick={vi.fn()} onPlay={vi.fn()} />);
    expect(screen.getByRole('link', { name: /التنبيهات/ })).toBeTruthy();
    unmount();
    platform.native = false;
    render(<Course course={course} ticks={none} onTick={vi.fn()} onPlay={vi.fn()} />);
    expect(screen.queryByRole('link', { name: /التنبيهات/ })).toBeNull();
  });

  it('روابط lists عن التطبيق in the mobile app only (the web has it as a tab)', () => {
    platform.native = true;
    const { unmount } = render(<Links state={FIXTURE_STATE} />);
    expect(screen.getByRole('link', { name: /عن التطبيق/ }).getAttribute('href')).toBe('#/about');
    unmount();
    platform.native = false;
    render(<Links state={FIXTURE_STATE} />);
    expect(screen.queryByRole('link', { name: /عن التطبيق/ })).toBeNull();
  });
});
