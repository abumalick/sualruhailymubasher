import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/preferences', () => ({
  Preferences: { get: async () => ({ value: null }), set: async () => {}, remove: async () => {}, keys: async () => ({ keys: [] }) },
}));
const platform = vi.hoisted(() => ({ native: false }));
vi.mock('../src/platform', () => ({ isNative: () => platform.native, nativeUI: () => platform.native }));
const shareEnv = vi.hoisted(() => ({ current: null as null | import('../src/share').ShareEnv }));
vi.mock('../src/share', async (actual) => ({ ...(await actual<typeof import('../src/share')>()), deviceShareEnv: () => shareEnv.current! }));
vi.mock('../src/push', () => ({
  askPermission: vi.fn(async () => 'granted'),
  pushPermission: vi.fn(async () => 'granted'),
  loadTopics: vi.fn(async () => []),
  setTopic: vi.fn(),
}));

import { shareMessage } from '../src/logic/share';
import { SITE } from '../src/site';
import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { parseRoute } from '../src/router';
import { About } from '../src/ui/About';
import { Links } from '../src/ui/Links';
import { More } from '../src/ui/More';
import { Notifications } from '../src/ui/Notifications';

const rows = () => [...document.querySelectorAll('.more .lesson')].map((a) => [a.querySelector('.b')!.textContent, a.getAttribute('href')]);

beforeEach(() => {
  platform.native = false;
});
afterEach(cleanup);

describe('routes', () => {
  it('#/more opens المزيد; retired and incomplete links land on home', () => {
    expect(parseRoute('#/more')).toEqual({ name: 'more' });
    expect(parseRoute('#/courses')).toEqual({ name: 'home' });
    expect(parseRoute('#/course')).toEqual({ name: 'home' });
    expect(parseRoute('#/book')).toEqual({ name: 'home' });
  });
});

describe('المزيد', () => {
  it('in the mobile app lists notifications, the tour, links and about', () => {
    platform.native = true;
    render(<More />);
    expect(rows()).toEqual([
      ['التنبيهات', '#/notifications'],
      ['كيف يعمل التطبيق', '#/welcome'],
      ['روابط', '#/links'],
      ['عن التطبيق', '#/about'],
      ['شارك التطبيق', null],
    ]);
  });

  it('on the web leaves notifications out', () => {
    render(<More />);
    expect(rows().map((r) => r[0])).toEqual(['كيف يعمل التطبيق', 'روابط', 'عن التطبيق', 'شارك التطبيق']);
  });
});

describe('شارك التطبيق', () => {
  const row = () => screen.getByRole('button', { name: /شارك التطبيق/ });
  const hint = () => row().querySelector('.m')!.textContent;

  it('is a row like the others, with a hint that says what it shares', () => {
    render(<More />);
    expect(row().classList.contains('lesson')).toBe(true);
    expect(row().querySelector('.mini.dashed svg')).not.toBeNull();
    expect(hint()).toBe('أرسل رابط التطبيق لمن تحب');
  });

  it('opens the share sheet with the message and leaves the hint alone', async () => {
    const nativeShare = vi.fn(async () => {});
    shareEnv.current = { native: true, nativeShare };
    render(<More />);
    fireEvent.click(row());
    await waitFor(() => expect(nativeShare).toHaveBeenCalledWith(shareMessage()));
    expect(hint()).toBe('أرسل رابط التطبيق لمن تحب');
  });

  it('without a share sheet copies the link and says so, then restores the hint', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const copy = vi.fn(async () => {});
      shareEnv.current = { native: false, nativeShare: vi.fn(), copy };
      render(<More />);
      fireEvent.click(row());
      await waitFor(() => expect(hint()).toBe('نُسخ الرابط، ألصقه في محادثة'));
      expect(copy).toHaveBeenCalledWith(SITE);
      expect(row().querySelector('.m')!.getAttribute('aria-live')).toBe('polite');
      await vi.advanceTimersByTimeAsync(4000);
      expect(hint()).toBe('أرسل رابط التطبيق لمن تحب');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the link when nothing can share or copy it', async () => {
    shareEnv.current = { native: false, nativeShare: vi.fn() };
    render(<More />);
    fireEvent.click(row());
    await waitFor(() => expect(hint()).toBe('تعذّرت المشاركة، الرابط: albadrmubasher.com'));
  });
});

describe('pages reached from المزيد', () => {
  const back = () => screen.getByRole('link', { name: 'رجوع' }).getAttribute('href');

  it('each has a back arrow to المزيد', () => {
    platform.native = true;
    render(<Links state={FIXTURE_STATE} />);
    expect(back()).toBe('#/more');
    cleanup();
    render(<About native />);
    expect(back()).toBe('#/more');
    cleanup();
    render(<Notifications state={FIXTURE_STATE} prefs={null} onToggle={() => {}} />);
    expect(back()).toBe('#/more');
  });

  it('روابط no longer repeats عن التطبيق', () => {
    platform.native = true;
    render(<Links state={FIXTURE_STATE} />);
    expect(screen.queryByRole('link', { name: /عن التطبيق/ })).toBeNull();
  });
});
