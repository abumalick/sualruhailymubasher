import { cleanup, render } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { fontsLoaded } from './fonts';
import '../../src/styles/tokens.css';
import '../../src/styles/app.css';

const fake = vi.hoisted(() => ({
  state: {
    src: { kind: 'recording', url: 'about:blank', title: 'شرح كتاب التوحيد · الدرس ٤٥٩', subtitle: 'تفسير سورة التوبة: من الآية (١)' },
    playing: true,
    position: 900,
    duration: 3600,
    error: null,
  },
  onChange: () => () => {},
  pause: () => {},
  resume: async () => {},
  seek: vi.fn(),
  skip: vi.fn(),
}));
vi.mock('../../src/audio/player', () => ({ player: fake }));

import { MiniPlayer } from '../../src/ui/MiniPlayer';
import { NavBar } from '../../src/ui/NavBar';
import { Defs } from '../../src/ui/Star';

const HEIGHT = 844;
const TARGET = 44;
// Android scales WebView text with the phone's font size; the largest common setting is about 1.3, some phones go to 2.
const FS_TOKENS = ['--fs-caption', '--fs-label', '--fs-body-sm', '--fs-button', '--fs-body', '--fs-title'];

afterEach(() => {
  cleanup();
  Object.assign(fake.state, { position: 900, duration: 3600 });
  document.body.style.width = '';
  for (const t of FS_TOKENS) document.documentElement.style.removeProperty(t);
});

async function show(width: number, textScale = 1) {
  await page.viewport(width, HEIGHT);
  document.documentElement.dir = 'rtl';
  document.body.style.width = `${width}px`;
  const root = getComputedStyle(document.documentElement);
  for (const t of FS_TOKENS) document.documentElement.style.setProperty(t, `${parseFloat(root.getPropertyValue(t)) * textScale}px`);
  const { container } = render(
    <div class="shell lat" style={`height:${HEIGHT}px`}>
      <Defs />
      <div class="scroll" />
      <MiniPlayer />
      <NavBar route={{ name: 'more' }} tabs={[]} />
    </div>,
  );
  await fontsLoaded();
  return container;
}

const rect = (c: Element, sel: string) => c.querySelector(sel)!.getBoundingClientRect();

for (const width of [320, 360, 390]) {
  for (const scale of [1, 1.3, 2]) {
    it(`at ${width}px with text ×${scale}: every control is at least ${TARGET}px and nothing leaves the screen`, async () => {
      const c = await show(width, scale);
      for (const sel of ['.skip', '.skip.fwd', '.ctl .mini']) {
        const r = rect(c, sel);
        expect.soft(Math.round(r.width), sel).toBeGreaterThanOrEqual(TARGET);
        expect.soft(Math.round(r.height), sel).toBeGreaterThanOrEqual(TARGET);
      }
      const rail = rect(c, '.rail');
      expect(Math.round(rail.height)).toBeGreaterThanOrEqual(TARGET);
      expect(rail.width).toBeGreaterThanOrEqual(width / 3);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
      const outside = [...c.querySelectorAll('.mp *')]
        .filter((el) => !el.closest('svg'))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.right > width + 0.5 || r.left < -0.5);
        })
        .map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
      expect(outside).toEqual([]);
      const times = [...c.querySelectorAll('.seek time')].map((t) => t.getBoundingClientRect());
      expect(times[0].right).toBeLessThan(times[1].left);
      for (const t of times) expect(t.height).toBeLessThan(parseFloat(getComputedStyle(c.querySelector('.seek')!).fontSize) * 2);
    }, 30_000);
  }
}

it('the bar keeps its place while the time labels count up, so it never slides under a dragging finger', async () => {
  const rails = [];
  for (const [position, duration] of [[4, 2605], [1247, 2605], [5, 3600], [3599, 3600], [3, 59]]) {
    Object.assign(fake.state, { position, duration });
    const r = rect(await show(320), '.rail');
    rails.push({ duration, left: r.left, width: r.width });
    cleanup();
  }
  expect(rails[1]).toEqual(rails[0]);
  expect(rails[3]).toEqual(rails[2]);
});

it('dragging on the bar cannot scroll the page', async () => {
  const c = await show(360);
  expect(getComputedStyle(c.querySelector('.rail')!).touchAction).toBe('none');
});

it('in the Arabic app the timeline still runs left to right, like the play triangle', async () => {
  const c = await show(360);
  const rail = rect(c, '.rail');
  const fill = rect(c, '.rail .prog');
  const thumb = rect(c, '.rail b');
  expect(fill.left).toBeCloseTo(rail.left, 0);
  expect(fill.width).toBeCloseTo(rail.width / 4, 0);
  expect(thumb.left + thumb.width / 2).toBeCloseTo(rail.left + rail.width / 4, 0);
  const [elapsed, total] = [...c.querySelectorAll('.seek time')];
  expect(elapsed.firstElementChild!.textContent).toBe('٠:١٥:٠٠');
  expect(elapsed.getBoundingClientRect().right).toBeLessThanOrEqual(rail.left);
  expect(total.getBoundingClientRect().left).toBeGreaterThanOrEqual(rail.right);
  expect(rect(c, '.skip').right).toBeLessThanOrEqual(rect(c, '.ctl .mini').left);
  expect(rect(c, '.skip.fwd').left).toBeGreaterThanOrEqual(rect(c, '.ctl .mini').right);
  expect(rect(c, '.ctl').left).toBeGreaterThan(rect(c, '.mp .t').left);
});
