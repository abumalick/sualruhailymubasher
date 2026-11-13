import { cleanup, render } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { commands, page, userEvent } from 'vitest/browser';
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

async function at(steps: number) {
  await page.viewport(WIDTH, HEIGHT);
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

it('the continue button is on the first screen without scrolling, and on the live step', async () => {
  let c = await at(0);
  expect(primary(c).getBoundingClientRect().bottom).toBeLessThanOrEqual(HEIGHT);
  cleanup();
  c = await at(1);
  expect(primary(c).getBoundingClientRect().bottom).toBeLessThanOrEqual(HEIGHT);
});

it('each switch row is a thumb-sized target and the example is labelled', async () => {
  const c = await at(1);
  const label = c.querySelector<HTMLElement>('.flabel')!;
  expect(label.textContent).toBe('مثال من درس الفجر');
  expect(label.getBoundingClientRect().height).toBeGreaterThan(0);
  const rows = [...c.querySelectorAll<HTMLElement>('.ob .notifs .lesson')];
  expect(rows).toHaveLength(3);
  for (const row of rows) expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
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
