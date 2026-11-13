import { cleanup, render } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { fontsLoaded } from './fonts';
import '../../src/styles/tokens.css';
import '../../src/styles/app.css';

vi.mock('../../src/platform', () => ({ isNative: () => false, nativeUI: () => false }));

import { InstallBanner, resetInstallBanner } from '../../src/ui/InstallBanner';
import { NavBar } from '../../src/ui/NavBar';
import { Defs } from '../../src/ui/Star';

const HEIGHT = 700;
const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.style.width = '';
  try {
    localStorage.clear();
  } catch {}
  resetInstallBanner();
});

async function show(width: number, ua: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
  await page.viewport(width, HEIGHT);
  document.documentElement.dir = 'rtl';
  document.body.style.width = `${width}px`;
  const { container } = render(
    <div class="shell" style={`height:${HEIGHT}px`}>
      <Defs />
      <div class="scroll">
        <InstallBanner />
        <p class="quiet">…</p>
      </div>
      <NavBar route={{ name: 'more' }} tabs={[]} />
    </div>,
  );
  await fontsLoaded();
  return container;
}

for (const width of [320, 360, 390]) {
  for (const [device, ua] of Object.entries(UA)) {
    it(`at ${width}px for ${device}: the banner fits, its close button is a full target, and it sits above the nav`, async () => {
      const c = await show(width, ua);
      const banner = c.querySelector('.install')!.getBoundingClientRect();
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
      const outside = [...c.querySelectorAll('.install *')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > banner.right + 0.5 || r.left < banner.left - 0.5);
      });
      expect(outside.map((el) => el.outerHTML.slice(0, 60))).toEqual([]);
      const x = c.querySelector('.install .x')!.getBoundingClientRect();
      expect(Math.round(x.width)).toBeGreaterThanOrEqual(44);
      expect(Math.round(x.height)).toBeGreaterThanOrEqual(44);
      const links = [...c.querySelectorAll('.install a')].map((a) => a.getBoundingClientRect());
      expect(links.length).toBe(device === 'desktop' ? 2 : 1);
      for (const l of links) expect(l.bottom).toBeLessThanOrEqual(banner.bottom);
      expect(banner.bottom).toBeLessThanOrEqual(c.querySelector('.nav')!.getBoundingClientRect().top);
    });
  }
}

it('renders and dismisses when the browser blocks storage', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('SecurityError');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('SecurityError');
  });
  const c = await show(360, UA.android);
  expect(c.querySelector('.install')).toBeTruthy();
  (c.querySelector('.install .x') as HTMLButtonElement).click();
  await expect.poll(() => c.querySelector('.install')).toBeNull();
});
