import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
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

vi.mock('../src/site', async (importOriginal) => {
  const site = await importOriginal<typeof import('../src/site')>();
  return { ...site, STORES: [...site.STORES, { id: 'appstore', name: 'App Store', url: 'https://apps.apple.com/app/id1234567890' }] };
});
import * as api from '../src/api';
import { App } from '../src/App';
import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { seedPrefs } from './seed';
import { About } from '../src/ui/About';
import { resetInstallBanner } from '../src/ui/InstallBanner';

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
    expect(href(/موقع الشيخ/)).toBe('https://sualruhaily.com');
    expect(href(/Mixlr/)).toBe('https://sualruhaily.mixlr.com');
    expect(href(/سياسة الخصوصية/)).toBe('https://sualruhailymubasher.com/privacy');
    expect(href(/تواصل معنا/)).toBe('mailto:contact@sualruhailymubasher.com');
    expect(screen.getByText('سليمان الرحيلي مباشر')).toBeTruthy();
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

  it('on the web it points to the mobile apps for notifications, with a link to each store', () => {
    render(<About native={false} />);
    expect(screen.getByText(/لا تتوفر التنبيهات في نسخة المتصفح/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Google Play' }).getAttribute('href')).toBe('https://play.google.com/store/apps/details?id=com.sualruhailymubasher.app');
    expect(screen.getByRole('link', { name: 'App Store' }).getAttribute('href')).toBe('https://apps.apple.com/app/id1234567890');
    expect(screen.queryByText(/قريبًا/)).toBeNull();
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

describe('install banner on the web', () => {
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
  const banner = () => document.querySelector('.install');
  const storeLinks = () => [...banner()!.querySelectorAll('a')].map((a) => [a.querySelector('img')!.alt, a.getAttribute('href')]);

  beforeEach(() => {
    localStorage.clear();
    resetInstallBanner();
  });
  afterEach(() => vi.restoreAllMocks());

  it('invites an Android visitor to Google Play only, above the page', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ANDROID);
    await app('#/more');
    expect(banner()!.parentElement!.classList.contains('scroll')).toBe(true);
    expect(banner()!.parentElement!.firstElementChild).toBe(banner());
    expect(storeLinks()).toEqual([['احصل عليه من Google Play', 'https://play.google.com/store/apps/details?id=com.sualruhailymubasher.app']]);
    expect(banner()!.textContent!.replace(/غير رسمي/g, '')).not.toMatch(/رسمي/);
  });

  it('invites an iPhone visitor to the App Store only', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE);
    await app('#/more');
    expect(storeLinks()).toEqual([['تنزيل من App Store', 'https://apps.apple.com/app/id1234567890']]);
  });

  it('a dismissal is remembered across visits', async () => {
    await app('#/more');
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
    expect(banner()).toBeNull();
    expect(localStorage.getItem('install-banner-dismissed')).toBe('1');
    cleanup();
    resetInstallBanner();
    await app('#/about');
    expect(banner()).toBeNull();
  });

  it('without storage it still shows, and a dismissal holds for the visit', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await app('#/more');
    expect(banner()).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
    expect(banner()).toBeNull();
    cleanup();
    await app('#/about');
    expect(banner()).toBeNull();
  });

  it('stays out of the onboarding and the book', async () => {
    location.hash = '#/';
    vi.mocked(api.loadCachedState).mockResolvedValue(FIXTURE_STATE);
    vi.mocked(api.fetchState).mockResolvedValue({ state: FIXTURE_STATE, fresh: true });
    render(<App />);
    await screen.findByRole('button', { name: /متابعة|ابدأ/ });
    expect(banner()).toBeNull();
    cleanup();
    location.hash = '#/book/unknown/0/1';
    seedPrefs(store, FIXTURE_STATE.courses);
    render(<App />);
    await screen.findByText('تعذّر تحميل الكتاب');
    expect(banner()).toBeNull();
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

  it('never shows the install banner', async () => {
    await app('#/more');
    expect(document.querySelector('.install')).toBeNull();
  });
});
