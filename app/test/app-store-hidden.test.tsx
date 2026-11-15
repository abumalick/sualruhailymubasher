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
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

describe('while the iOS app has no App Store id', () => {
  beforeEach(() => {
    localStorage.clear();
    resetInstallBanner();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lists only Google Play', () => {
    expect(STORES.map((s) => s.id)).toEqual(['play']);
    expect(listedStores(['play', 'appstore'])).toEqual(['play']);
    expect(updateUrl('ios')).toBeNull();
  });

  it('About links to Google Play only', () => {
    render(<About native={false} />);
    expect(screen.getByRole('link', { name: 'Google Play' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'App Store' })).toBeNull();
  });

  it('the store badges leave out the App Store', () => {
    const { container } = render(<StoreBadges ids={['appstore', 'play']} />);
    expect([...container.querySelectorAll<HTMLImageElement>('img')].map((i) => i.alt)).toEqual(['احصل عليه من Google Play']);
  });

  it('the install banner is hidden for an iPhone visitor', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE);
    const { container } = render(<InstallBanner />);
    expect(container.querySelector('.install')).toBeNull();
  });

  it('the install banner offers Google Play alone on a desktop', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(DESKTOP);
    const { container } = render(<InstallBanner />);
    expect([...container.querySelectorAll<HTMLImageElement>('.install img')].map((i) => i.alt)).toEqual(['احصل عليه من Google Play']);
  });
});
