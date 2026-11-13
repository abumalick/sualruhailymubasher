import { cleanup, render } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { commands, page, userEvent } from 'vitest/browser';
import { fontsLoaded } from './fonts';
import '../../src/styles/tokens.css';
import '../../src/styles/app.css';

vi.mock('../../src/platform', () => ({ nativeUI: () => true, isNative: () => false }));

import { FIXTURE_STATE } from '../../src/dev/fixture-state';
import { Onboarding } from '../../src/ui/Onboarding';
import { Defs } from '../../src/ui/Star';

const WIDTH = 390;
const HEIGHT = 844;
const MON_2110 = new Date('2026-11-02T18:10:00Z');

afterEach(async () => {
  cleanup();
  await commands.emulateMedia({ colorScheme: null });
});

async function at(steps: number, width = WIDTH, height = HEIGHT) {
  await page.viewport(width, height);
  document.documentElement.dir = 'rtl';
  const backRef = { current: null };
  const view = render(
    <div class="shell" style={`height:${height}px`}>
      <Defs />
      <div class="scroll">
        <Onboarding state={FIXTURE_STATE} prefs={null} now={MON_2110} replay={false} backRef={backRef} onDone={() => {}} onLeave={() => {}} />
      </div>
    </div>,
  );
  await fontsLoaded();
  for (let i = 0; i < steps; i++) {
    const heading = view.container.querySelector('h3')!.textContent;
    await userEvent.click(page.getByRole('button', { name: 'متابعة' }));
    await expect.poll(() => view.container.querySelector('h3')!.textContent).not.toBe(heading);
  }
  return view.container;
}

const primary = (c: Element) => c.querySelector<HTMLElement>('.chip.pri.wide')!;

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [steps, name] of [
    [0, 'the app screen'],
    [1, 'the live step'],
    [2, 'the revision step'],
    [3, 'the preparation step'],
  ] as const) {
    it(`${name} fits a phone in ${colorScheme} mode, without sideways scrolling`, async () => {
      await commands.emulateMedia({ colorScheme });
      const c = await at(steps);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(WIDTH);
      for (const el of c.querySelectorAll('.ob *')) expect(el.getBoundingClientRect().right).toBeLessThanOrEqual(WIDTH + 0.5);
      expect(primary(c).getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    });
  }
}

for (const [steps, name] of [
  [1, 'the live step'],
  [3, 'the preparation step, with both reminder times'],
] as const) {
  it(`${name} fits a 320 px phone, its switch beside its label`, async () => {
    const c = await at(steps, 320);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320);
    for (const el of c.querySelectorAll('.ob *')) expect(el.getBoundingClientRect().right).toBeLessThanOrEqual(320 + 0.5);
    const tog = c.querySelector<HTMLElement>('.ob .notifs .tog')!.getBoundingClientRect();
    const text = c.querySelector<HTMLElement>('.ob .notifs .lesson .t')!.getBoundingClientRect();
    expect(tog.width).toBeGreaterThan(0);
    expect(tog.right).toBeLessThanOrEqual(text.left + 0.5);
  });
}

it('the preparation switch gives each ticked lesson its reminder time on a line of its own, even at 320 px', async () => {
  const c = await at(3, 320);
  const hint = c.querySelector<HTMLElement>('.ob .notifs .lesson .m')!;
  expect(hint.innerText.split('\n')).toHaveLength(2);
  const range = document.createRange();
  range.selectNodeContents(hint);
  const lines = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
  expect(lines.size).toBe(2);
});

it('the continue button is on the first screen without scrolling, and on the live step', async () => {
  let c = await at(0);
  expect(primary(c).getBoundingClientRect().bottom).toBeLessThanOrEqual(HEIGHT);
  cleanup();
  c = await at(1);
  expect(primary(c).getBoundingClientRect().bottom).toBeLessThanOrEqual(HEIGHT);
});

it('the step has one thumb-sized switch row, and the picture is captioned as an example', async () => {
  const c = await at(1);
  const caption = c.querySelector<HTMLElement>('.pv-cap')!;
  expect(caption.textContent).toBe('مثال: هكذا يصلك التنبيه');
  expect(caption.getBoundingClientRect().height).toBeGreaterThan(0);
  const rows = [...c.querySelectorAll<HTMLElement>('.ob .notifs .lesson')];
  expect(rows).toHaveLength(1);
  for (const row of rows) expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
});

it('the picture draws the app at under half size, inside a tinted panel, with the switch below it', async () => {
  const c = await at(2);
  const pv = c.querySelector<HTMLElement>('.pv')!.getBoundingClientRect();
  const screen = c.querySelector<HTMLElement>('.pv-screen')!.getBoundingClientRect();
  expect(screen.width).toBeLessThanOrEqual(WIDTH * 0.5);
  expect(c.querySelector<HTMLElement>('.ob .notifs')!.getBoundingClientRect().top).toBeGreaterThanOrEqual(pv.bottom);
});

it('a real tap on the picture opens nothing', async () => {
  location.hash = '#/';
  const c = await at(2);
  const link = c.querySelector<HTMLElement>('.pv a')!;
  await userEvent.click(link, { force: true });
  expect(location.hash).toBe('#/');
});

for (const [width, height] of [
  [320, 568],
  [390, 844],
] as const) {
  for (const steps of [1, 2, 3]) {
    it(`step ${steps + 1} at ${width}×${height}: the switch and the continue button are on screen, under a picture of at least 180 px`, async () => {
      const c = await at(steps, width, height);
      expect(primary(c).getBoundingClientRect().bottom).toBeLessThanOrEqual(height);
      expect(c.querySelector<HTMLElement>('.pv')!.getBoundingClientRect().height).toBeGreaterThanOrEqual(180);
    });
  }
}

declare module 'vitest/browser' {
  interface BrowserCommands {
    emulateMedia: (media: { colorScheme?: 'light' | 'dark' | null; reducedMotion?: 'reduce' | 'no-preference' | null }) => Promise<void>;
  }
}
