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

async function at(steps: number, width = WIDTH) {
  await page.viewport(width, HEIGHT);
  document.documentElement.dir = 'rtl';
  const backRef = { current: null };
  const view = render(
    <div class="shell" style={`height:${HEIGHT}px`}>
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

it('the step has one thumb-sized switch row, and the example is labelled', async () => {
  const c = await at(1);
  const label = c.querySelector<HTMLElement>('.flabel')!;
  expect(label.textContent).toBe('مثال من درس الفجر');
  expect(label.getBoundingClientRect().height).toBeGreaterThan(0);
  const rows = [...c.querySelectorAll<HTMLElement>('.ob .notifs .lesson')];
  expect(rows).toHaveLength(1);
  for (const row of rows) expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
});

it('the example live hero paints and pulses like the real one', async () => {
  const c = await at(1);
  const disc = c.querySelector<HTMLElement>('.frame .disc .btn')!;
  const go = c.querySelector<HTMLElement>('.frame .go-live')!;
  expect(getComputedStyle(disc).backgroundColor).toBe(getComputedStyle(go).backgroundColor);
  expect(getComputedStyle(disc, '::before').animationName).toBe('ring');
});

it('a real tap on the example book link opens nothing', async () => {
  location.hash = '#/';
  const c = await at(2);
  const link = c.querySelector<HTMLElement>('.frame a')!;
  await userEvent.click(link, { force: true });
  expect(location.hash).toBe('#/');
});

declare module 'vitest/browser' {
  interface BrowserCommands {
    emulateMedia: (media: { colorScheme?: 'light' | 'dark' | null; reducedMotion?: 'reduce' | 'no-preference' | null }) => Promise<void>;
  }
}
