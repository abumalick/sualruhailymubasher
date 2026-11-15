import { act, cleanup, render } from '@testing-library/preact';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { commands, page } from 'vitest/browser';
import { fontsLoaded } from './fonts';
import '../../src/styles/tokens.css';
import '../../src/styles/app.css';

import { FIXTURE_STATE } from '../../src/dev/fixture-state';
import { cardFor } from '../../src/logic/onboarding';
import type { Variant } from '../../src/logic/preview';
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

async function show(step: 'live' | 'rec' | 'prep', width: number, variant: Variant = 'apps') {
  await page.viewport(width, HEIGHT);
  document.documentElement.dir = 'rtl';
  const { container } = render(
    <div class="shell" style={`height:${HEIGHT}px`}>
      <Defs />
      <div class="scroll">
        <div class="choose ob">
          <Preview card={cardFor(step, [tafsir], FIXTURE_STATE.live)!} state={FIXTURE_STATE} now={NOW} variant={variant} />
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

// Where the story ends, the control it taps sits inside the picture, above its caption.
const END: Record<'live' | 'rec' | 'prep', string> = { live: '.mx-play', rec: '.pv-target .chip[aria-pressed]', prep: '.pdffoot .chip[aria-pressed]' };

for (const width of [320, 390]) {
  for (const step of ['live', 'rec', 'prep'] as const) {
    it(`${step} at ${width}px with reduced motion rests in the app, the control it tapped in view above the caption, the notification gone, nothing moving`, async () => {
      await commands.emulateMedia({ reducedMotion: 'reduce' });
      const pv = await show(step, width);
      const panel = pv.getBoundingClientRect();
      const cap = pv.querySelector<HTMLElement>('.pv-cap')!.getBoundingClientRect();
      const control = pv.querySelector<HTMLElement>(END[step])!.getBoundingClientRect();
      expect(control.top).toBeGreaterThanOrEqual(panel.top);
      expect(control.bottom).toBeLessThanOrEqual(cap.top);
      expect(control.left).toBeGreaterThanOrEqual(panel.left);
      expect(control.right).toBeLessThanOrEqual(panel.right);
      expect(getComputedStyle(pv.querySelector('.pv-banner')!).opacity).toBe('0');
      expect(getComputedStyle(pv.querySelector('.pv-app')!).opacity).toBe('1');
      expect(document.getAnimations().filter((a) => pv.contains((a.effect as KeyframeEffect).target as Node))).toEqual([]);
    });
  }

  it(`rec at ${width}px: the app's player bar sits at the bottom of the phone, in view, under the ticked card`, async () => {
    await commands.emulateMedia({ reducedMotion: 'reduce' });
    const pv = await show('rec', width);
    const cap = pv.querySelector<HTMLElement>('.pv-cap')!.getBoundingClientRect();
    const bar = pv.querySelector<HTMLElement>('.pv-app > .mp')!.getBoundingClientRect();
    const screen = pv.querySelector<HTMLElement>('.pv-screen')!.getBoundingClientRect();
    const card = pv.querySelector<HTMLElement>('.pv-target')!.getBoundingClientRect();
    expect(Math.abs(bar.bottom - screen.bottom)).toBeLessThan(1);
    expect(bar.top).toBeLessThan(cap.top);
    expect(card.bottom).toBeLessThanOrEqual(bar.top);
  });

  it(`at ${width}px the tapped controls are in view when the ghost finger presses them`, async () => {
    for (const [step, ms, sel] of [
      ['live', 5500, '.mx-play'],
      ['rec', 5500, '.pv-target button.chip.pri'],
      ['rec', 8700, '.pv-target .chip[aria-pressed]'],
      ['prep', 5700, '.pdffoot .chip[aria-pressed]'],
    ] as const) {
      cleanup();
      start = Date.now();
      const pv = await show(step, width);
      await at(ms);
      const panel = pv.getBoundingClientRect();
      const cap = pv.querySelector<HTMLElement>('.pv-cap')!.getBoundingClientRect();
      const control = pv.querySelector<HTMLElement>(sel)!.getBoundingClientRect();
      expect(control.top, `${step} ${sel}`).toBeGreaterThanOrEqual(panel.top);
      expect(control.bottom, `${step} ${sel}`).toBeLessThanOrEqual(cap.top);
    }
  });
}

it('the drawn Mixlr player is never loaded, and the app’s big red play button never appears', async () => {
  await commands.emulateMedia({ reducedMotion: 'reduce' });
  const pv = await show('live', 390);
  expect(pv.querySelector('iframe')).toBeNull();
  expect(document.querySelector('.disc, .go-live')).toBeNull();
  const play = pv.querySelector<HTMLElement>('.mx-play')!.getBoundingClientRect();
  expect(play.width).toBeLessThan(40);
});

for (const width of [320, 390]) {
  it(`web at ${width}px: the on-air page has no next lesson, the tapped controls are in view, nothing overflows sideways`, async () => {
    for (const [step, ms, sel] of [
      ['live', 1500, '.pv-target .disc .btn'],
      ['live', 3700, '.mx-play'],
      ['prep', 1800, '.pv-target a.chip.pri'],
      ['rec', 1800, '.pv-target button.chip.pri'],
    ] as const) {
      cleanup();
      start = Date.now();
      const pv = await show(step, width, 'web');
      await at(ms);
      if (step === 'live' && ms === 1500) expect(pv.querySelector('.pv-lp')!.textContent).not.toContain('الدرس القادم');
      const panel = pv.getBoundingClientRect();
      const cap = pv.querySelector<HTMLElement>('.pv-cap')!.getBoundingClientRect();
      const control = pv.querySelector<HTMLElement>(sel)!.getBoundingClientRect();
      expect(control.top, `${step} ${sel}`).toBeGreaterThanOrEqual(panel.top);
      expect(control.bottom, `${step} ${sel}`).toBeLessThanOrEqual(cap.top);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(innerWidth);
    }
  });
}

it('the invite with reduced motion rests on its notification, readable, over the dimmed page', async () => {
  await commands.emulateMedia({ reducedMotion: 'reduce' });
  const pv = await show('live', 390, 'invite');
  expect(getComputedStyle(pv.querySelector('.pv-banner')!).opacity).toBe('1');
  expect(getComputedStyle(pv.querySelector('.pv-app')!).opacity).toBe('0.45');
});
