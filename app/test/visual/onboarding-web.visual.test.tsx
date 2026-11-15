import { cleanup, render } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { commands, page, userEvent } from 'vitest/browser';
import { fontsLoaded } from './fonts';
import '../../src/styles/tokens.css';
import '../../src/styles/app.css';

vi.mock('../../src/platform', () => ({ nativeUI: () => false, isNative: () => false }));

vi.mock('../../src/site', async (importOriginal) => {
  const site = await importOriginal<typeof import('../../src/site')>();
  return { ...site, STORES: [...(await import('../listed-stores')).LISTED_STORES] };
});

import { FIXTURE_STATE } from '../../src/dev/fixture-state';
import { Onboarding } from '../../src/ui/Onboarding';
import { Defs } from '../../src/ui/Star';

const MON_2110 = new Date('2026-11-02T18:10:00Z');

afterEach(async () => {
  cleanup();
  await commands.emulateMedia({ colorScheme: null, reducedMotion: null });
});

async function at(steps: number, width: number, height: number) {
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
  settle();
  return view.container;
}

const settle = () => {
  for (const a of document.getAnimations()) if (a.effect?.getTiming().iterations !== Infinity) a.finish();
};

for (const [width, height] of [
  [320, 568],
  [390, 844],
] as const) {
  for (const colorScheme of ['light', 'dark'] as const) {
    it(`the invite at ${width}×${height} in ${colorScheme}: title, badges and «متابعة على الموقع» on screen, nothing sideways`, async () => {
      await commands.emulateMedia({ colorScheme });
      const c = await at(4, width, height);
      expect(c.querySelector('h3')!.textContent).toBe('التنبيهات في تطبيق الجوال');
      for (const el of [c.querySelector('h3')!, ...c.querySelectorAll('.obstores a'), c.querySelector('.chip.pri.wide')!]) {
        const box = el.getBoundingClientRect();
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.bottom).toBeLessThanOrEqual(height);
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width);
      }
      expect(c.querySelectorAll('.obstores a')).toHaveLength(2);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    });
  }

  it(`the live step at ${width}×${height}: the disc the finger taps is in the picture, above its caption`, async () => {
    const c = await at(1, width, height);
    const pv = c.querySelector<HTMLElement>('.pv')!;
    await expect.poll(() => pv.dataset.tap, { timeout: 3000 }).toBe('live');
    settle();
    const panel = pv.getBoundingClientRect();
    const cap = pv.querySelector('.pv-cap')!.getBoundingClientRect();
    const disc = pv.querySelector('.disc .btn')!.getBoundingClientRect();
    expect(disc.top).toBeGreaterThanOrEqual(panel.top);
    expect(disc.bottom).toBeLessThanOrEqual(cap.top);
  });
}

it('a real tap on the web live picture opens nothing: no live player, no audio', async () => {
  location.hash = '#/';
  const c = await at(1, 390, 844);
  await userEvent.click(c.querySelector<HTMLElement>('.pv .disc .btn')!, { force: true });
  expect(document.querySelector('.sheet:not(.pv .sheet)')).toBeNull();
  expect(document.querySelector('audio, iframe')).toBeNull();
  expect(location.hash).toBe('#/');
});
