import { cleanup, render } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { commands, page } from 'vitest/browser';
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
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};
// Both brands ask for at least a 40 px badge with a quarter of its height clear around it.
const BADGE_H = 40;
const CLEAR = BADGE_H / 4;

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  document.body.style.width = '';
  document.documentElement.classList.remove('web');
  await commands.emulateMedia({ colorScheme: null });
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
  await Promise.all([...container.querySelectorAll<HTMLImageElement>('.install img')].map((img) => img.decode()));
  return container;
}

const rect = (el: Element) => el.getBoundingClientRect();

function expectFits(c: Element, width: number) {
  const banner = rect(c.querySelector('.install')!);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  const outside = [...c.querySelectorAll('.install *')].filter((el) => {
    const r = rect(el);
    return r.width > 0 && (r.right > banner.right + 0.5 || r.left < banner.left - 0.5 || r.bottom > banner.bottom + 0.5 || r.top < banner.top - 0.5);
  });
  expect(outside.map((el) => el.outerHTML.slice(0, 60))).toEqual([]);
  const x = rect(c.querySelector('.install .x')!);
  expect(Math.round(x.width)).toBeGreaterThanOrEqual(44);
  expect(Math.round(x.height)).toBeGreaterThanOrEqual(44);
  for (const t of c.querySelectorAll<HTMLElement>('.install .t > *')) {
    expect(parseFloat(getComputedStyle(t).fontSize)).toBeGreaterThanOrEqual(13);
    expect(t.scrollWidth, `${t.textContent} is cut`).toBeLessThanOrEqual(t.clientWidth);
    expect(Math.round(rect(t).height), `${t.textContent} wraps`).toBeLessThan(2 * parseFloat(getComputedStyle(t).fontSize) * 1.2);
  }
  for (const img of c.querySelectorAll<HTMLImageElement>('.install img')) {
    expect(img.naturalWidth, img.alt).toBeGreaterThan(0);
    expect([getComputedStyle(img).filter, getComputedStyle(img).opacity]).toEqual(['none', '1']);
  }
  const badges = [...c.querySelectorAll('.install a')].map(rect);
  for (const b of badges) {
    expect(Math.round(b.height)).toBeGreaterThanOrEqual(BADGE_H);
    expect(b.top - banner.top).toBeGreaterThanOrEqual(CLEAR - 0.5);
    expect(banner.bottom - b.bottom).toBeGreaterThanOrEqual(CLEAR - 0.5);
  }
  const neighbours = [...c.querySelectorAll('.install .t, .install .x .g')].map(rect);
  for (const b of badges) {
    for (const n of [...neighbours, ...badges.filter((o) => o !== b)]) {
      const gap = Math.max(n.left - b.right, b.left - n.right, n.top - b.bottom, b.top - n.bottom);
      expect(gap).toBeGreaterThanOrEqual(CLEAR - 0.5);
    }
  }
  expect(banner.bottom).toBeLessThanOrEqual(rect(c.querySelector('.nav')!).top);
  return { banner, badges };
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [320, 360, 390]) {
    for (const device of ['android', 'iphone'] as const) {
      it(`at ${width}px for ${device} in ${colorScheme}: one thin row with the store badge and a full-size close button`, async () => {
        await commands.emulateMedia({ colorScheme });
        const c = await show(width, UA[device]);
        const { banner, badges } = expectFits(c, width);
        expect(badges.length).toBe(1);
        expect(Math.round(banner.width)).toBe(width);
        expect(banner.height).toBeLessThanOrEqual(BADGE_H + 2 * CLEAR + 2);
        const rows = [...c.querySelectorAll('.install .t, .install a, .install .x')].map((el) => rect(el));
        for (const r of rows) expect(Math.abs((r.top + r.bottom) / 2 - (banner.top + banner.bottom) / 2)).toBeLessThan(2);
      });
    }
  }
}

it('on a desktop both badges sit side by side in one row, inside the reading column', async () => {
  document.documentElement.classList.add('web');
  const c = await show(1024, UA.desktop);
  const { banner, badges } = expectFits(c, 1024);
  const column = c.querySelector('.scroll p')!.getBoundingClientRect();
  expect([Math.round(banner.left), Math.round(banner.right)]).toEqual([Math.round(column.left), Math.round(column.right)]);
  expect(badges.length).toBe(2);
  expect(banner.height).toBeLessThanOrEqual(BADGE_H + 2 * CLEAR + 2);
  expect(Math.abs(badges[0].top - badges[1].top)).toBeLessThan(1);
});

for (const width of [320, 360, 390]) {
  it(`a desktop browser as narrow as ${width}px drops the two badges under the text, without overflow`, async () => {
    const c = await show(width, UA.desktop);
    const { badges } = expectFits(c, width);
    expect(badges.length).toBe(2);
  });
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

declare module 'vitest/browser' {
  interface BrowserCommands {
    emulateMedia: (media: { colorScheme?: 'light' | 'dark' | null; reducedMotion?: 'reduce' | 'no-preference' | null }) => Promise<void>;
  }
}
