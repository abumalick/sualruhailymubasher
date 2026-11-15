import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { fontsLoaded } from './fonts';
import '../../src/styles/tokens.css';
import '../../src/styles/app.css';
import { UpdateBanner, UpdateRequired } from '../../src/ui/Update';

const HEIGHT = 700;
const URL = 'https://play.google.com/store/apps/details?id=com.sualruhailymubasher.app';
const rect = (el: Element) => el.getBoundingClientRect();

afterEach(() => {
  cleanup();
  document.body.style.width = '';
});

async function at(width: number, node: preact.ComponentChild) {
  await page.viewport(width, HEIGHT);
  document.documentElement.dir = 'rtl';
  document.body.style.width = `${width}px`;
  const { container } = render(node);
  await fontsLoaded();
  return container;
}

describe.each([320, 412])('at %i px', (width) => {
  it('centres the required notice and its button on the screen', async () => {
    const c = await at(width, <div style={`height:${HEIGHT}px;display:flex`}><UpdateRequired url={URL} /></div>);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    const button = rect(c.querySelector('.update-required a')!);
    expect(Math.round(button.height)).toBeGreaterThanOrEqual(44);
    const screen = rect(c.querySelector('.update-required')!);
    expect(Math.abs(button.left + button.width / 2 - (screen.left + screen.width / 2))).toBeLessThan(2);
    const title = rect(c.querySelector('.update-required h1')!);
    expect(title.top).toBeGreaterThan(HEIGHT / 4);
    expect(button.bottom).toBeLessThan((HEIGHT * 3) / 4);
  });

  it('keeps the banner on one line with a closable target', async () => {
    const c = await at(width, <div class="shell" style={`height:${HEIGHT}px`}><div class="scroll"><UpdateBanner url={URL} onClose={() => {}} /></div></div>);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    const banner = rect(c.querySelector('.install')!);
    for (const el of c.querySelectorAll('.install > *')) {
      const r = rect(el);
      expect(r.top).toBeGreaterThanOrEqual(banner.top - 0.5);
      expect(r.bottom).toBeLessThanOrEqual(banner.bottom + 0.5);
    }
    const x = rect(c.querySelector('.install .x')!);
    expect(Math.round(x.width)).toBeGreaterThanOrEqual(44);
    expect(Math.round(x.height)).toBeGreaterThanOrEqual(44);
  });
});
