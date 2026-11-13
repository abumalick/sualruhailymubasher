import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/preferences', () => ({
  Preferences: { get: async () => ({ value: null }), set: async () => {}, remove: async () => {}, keys: async () => ({ keys: [] }) },
}));
const platform = vi.hoisted(() => ({ native: false }));
vi.mock('../src/platform', () => ({ isNative: () => platform.native, nativeUI: () => platform.native }));
vi.mock('../src/push', () => ({
  askPermission: vi.fn(async () => 'granted'),
  pushPermission: vi.fn(async () => 'granted'),
  loadTopics: vi.fn(async () => []),
  setTopic: vi.fn(),
}));

import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { followOnly } from '../src/logic/follow';
import { parseRoute } from '../src/router';
import { About } from '../src/ui/About';
import { Chooser } from '../src/ui/Follow';
import { Links } from '../src/ui/Links';
import { More } from '../src/ui/More';
import { Notifications } from '../src/ui/Notifications';

const follow = followOnly(FIXTURE_STATE.courses, ['tafsir-saadi']);
const rows = () => [...document.querySelectorAll('.more a.lesson')].map((a) => [a.querySelector('.b')!.textContent, a.getAttribute('href')]);

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
  it('in the mobile app lists notifications, followed lessons, links and about', () => {
    platform.native = true;
    render(<More state={FIXTURE_STATE} follow={follow} />);
    expect(rows()).toEqual([
      ['التنبيهات', '#/notifications'],
      ['الدروس التي أتابعها', '#/follow'],
      ['روابط', '#/links'],
      ['عن التطبيق', '#/about'],
    ]);
  });

  it('on the web leaves notifications out', () => {
    render(<More state={FIXTURE_STATE} follow={follow} />);
    expect(rows().map((r) => r[0])).toEqual(['الدروس التي أتابعها', 'روابط', 'عن التطبيق']);
  });

  it('names what is followed, with a link to change it', () => {
    render(<More state={FIXTURE_STATE} follow={follow} />);
    expect(screen.getByText(/^دروسك:/)).toBeTruthy();
  });

  it('renders without a state', () => {
    render(<More state={null} follow={null} />);
    expect(rows().length).toBe(3);
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
    render(<Notifications state={FIXTURE_STATE} />);
    expect(back()).toBe('#/more');
    cleanup();
    render(<Chooser state={FIXTURE_STATE} follow={follow} first={false} />);
    expect(back()).toBe('#/more');
  });

  it('روابط no longer repeats عن التطبيق', () => {
    platform.native = true;
    render(<Links state={FIXTURE_STATE} />);
    expect(screen.queryByRole('link', { name: /عن التطبيق/ })).toBeNull();
  });
});
