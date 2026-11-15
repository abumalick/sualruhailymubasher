import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/platform', () => ({ isNative: () => false, nativeUI: () => false }));

import { listedStores } from '../src/logic/install';
import { updateUrl } from '../src/logic/update';
import { STORES } from '../src/site';
import { About } from '../src/ui/About';
import { InstallBanner, resetInstallBanner } from '../src/ui/InstallBanner';
import { StoreBadges } from '../src/ui/StoreBadges';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

describe('while neither store has a listing yet', () => {
  beforeEach(() => {
    localStorage.clear();
    resetInstallBanner();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lists no store', () => {
    expect(STORES).toEqual([]);
    expect(listedStores(['play', 'appstore'])).toEqual([]);
    expect(updateUrl('ios')).toBeNull();
    expect(updateUrl('android')).toBeNull();
  });

  it('a sideloaded build still passes its own android update link', () => {
    expect(updateUrl('android', 'https://example.com/latest')).toBe('https://example.com/latest');
  });

  it('About shows no store link', () => {
    render(<About native={false} />);
    expect(screen.queryByRole('link', { name: 'Google Play' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'App Store' })).toBeNull();
  });

  it('the store badges render nothing', () => {
    const { container } = render(<StoreBadges ids={['appstore', 'play']} />);
    expect(container.querySelectorAll('img, a')).toHaveLength(0);
  });

  it.each([
    ['an iPhone', IPHONE],
    ['an Android phone', ANDROID],
    ['a desktop', DESKTOP],
  ])('the install banner is not rendered for %s visitor', (_name, ua) => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
    const { container } = render(<InstallBanner />);
    expect(container.querySelector('.install')).toBeNull();
    expect(container.innerHTML).toBe('');
  });
});
