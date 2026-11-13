import { act, cleanup, render } from '@testing-library/preact';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { commands, page } from 'vitest/browser';
import { fontsLoaded } from './fonts';
import '../../src/styles/tokens.css';
import '../../src/styles/app.css';

import { FIXTURE_STATE } from '../../src/dev/fixture-state';
import { cardFor } from '../../src/logic/onboarding';
import { Preview } from '../../src/ui/Preview';
import { Defs } from '../../src/ui/Star';

const [tafsir] = FIXTURE_STATE.courses;
const NOW = new Date('2026-11-02T18:10:00Z');
const HEIGHT = 700;

beforeEach(() => vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] }));
afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await commands.emulateMedia({ reducedMotion: null });
});

async function show(step: 'live' | 'rec' | 'prep', width: number) {
  await page.viewport(width, HEIGHT);
  document.documentElement.dir = 'rtl';
  const { container } = render(
    <div class="shell" style={`height:${HEIGHT}px`}>
      <Defs />
      <div class="scroll">
        <div class="choose ob">
          <Preview card={cardFor(step, [tafsir], FIXTURE_STATE.live)!} state={FIXTURE_STATE} now={NOW} />
        </div>
      </div>
    </div>,
  );
  await fontsLoaded();
  return container.querySelector<HTMLElement>('.pv')!;
}

// Moves the clock to `ms` and lets every transition and animation reach its end, so positions are final.
async function at(ms: number) {
  await act(() => {
    vi.advanceTimersByTime(ms - Date.now() + start);
  });
  for (const a of document.getAnimations()) if (a.effect?.getTiming().iterations !== Infinity) a.finish();
}
let start = 0;

for (const width of [320, 390]) {
  for (const step of ['live', 'rec', 'prep'] as const) {
    it(`${step} at ${width}px: the grown notification stays centred at the top of the picture, also while it is tapped`, async () => {
      start = Date.now();
      const pv = await show(step, width);
      for (const ms of [1500, 2800, 3100]) {
        await at(ms);
        const panel = pv.getBoundingClientRect();
        const banner = pv.querySelector<HTMLElement>('.pv-banner')!.getBoundingClientRect();
        expect(Math.abs(banner.left + banner.width / 2 - (panel.left + panel.width / 2))).toBeLessThan(1);
        expect(Math.abs(banner.top - panel.top - 10)).toBeLessThan(1);
        expect(banner.left).toBeGreaterThanOrEqual(panel.left);
        expect(banner.right).toBeLessThanOrEqual(panel.right);
      }
      expect(pv.dataset.tap).toBe('banner');
    });
  }

  it(`at ${width}px the notification starts at the phone's width, then is gone before the phone opens`, async () => {
    start = Date.now();
    const pv = await show('live', width);
    await at(800);
    const phone = pv.querySelector<HTMLElement>('.pv-phone')!.getBoundingClientRect();
    const small = pv.querySelector<HTMLElement>('.pv-banner')!.getBoundingClientRect();
    expect(small.width).toBeLessThan(phone.width);
    expect(small.width).toBeGreaterThan(phone.width * 0.8);
    await at(3400);
    expect(getComputedStyle(pv.querySelector('.pv-banner')!).opacity).toBe('0');
  });
}

it('the phone is drawn smaller than the screen, and what it opens stays inside it', async () => {
  start = Date.now();
  const pv = await show('prep', 390);
  await at(4000);
  const screen = pv.querySelector<HTMLElement>('.pv-screen')!.getBoundingClientRect();
  expect(screen.width).toBeLessThan(390 * 0.5 + 1);
  const book = pv.querySelector<HTMLElement>('.book')!.getBoundingClientRect();
  expect(book.left).toBeGreaterThanOrEqual(screen.left - 0.5);
  expect(book.right).toBeLessThanOrEqual(screen.right + 0.5);
});

it('with reduced motion the still frame puts the recording card just under the notification, highlighted, with nothing moving', async () => {
  await commands.emulateMedia({ reducedMotion: 'reduce' });
  const pv = await show('rec', 390);
  const banner = pv.querySelector<HTMLElement>('.pv-banner')!.getBoundingClientRect();
  const card = pv.querySelector<HTMLElement>('.pv-target')!.getBoundingClientRect();
  expect(card.top).toBeGreaterThanOrEqual(banner.bottom);
  expect(card.top - banner.bottom).toBeLessThan(30);
  expect(pv.dataset.spot).toBe('');
  expect(document.getAnimations().filter((a) => pv.contains((a.effect as KeyframeEffect).target as Node))).toEqual([]);
});
