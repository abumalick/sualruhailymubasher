import { cleanup, render } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import '../../src/styles/tokens.css';
import '../../src/styles/app.css';
import { Lesson } from '../../src/ui/Lesson';
import { Defs } from '../../src/ui/Star';
import { liveDTO, TAWHID } from '../live-state';

afterEach(async () => {
  cleanup();
  await commands.emulateMedia({ colorScheme: null, reducedMotion: null });
});

function hero(listening: boolean) {
  document.documentElement.dir = 'rtl';
  document.body.style.width = '390px';
  const { container } = render(
    <div class="scroll">
      <Defs />
      <Lesson
        course={TAWHID}
        live={liveDTO('kitab-tawhid')}
        otherLive={null}
        ticks={{ read: new Set(), reviewed: new Set() }}
        now={new Date('2026-11-02T18:00:00Z')}
        onTick={() => {}}
        onPlay={() => {}}
        onLive={() => {}}
        listening={listening}
      />
    </div>,
  );
  const live = getComputedStyle(document.documentElement).getPropertyValue('--live').trim();
  const probe = document.createElement('i');
  probe.style.color = live;
  document.body.append(probe);
  const liveRgb = getComputedStyle(probe).color;
  probe.remove();
  return { container, liveRgb };
}

it('the live hero on the lesson page paints its listen button and disc in the live colour, at a thumb-sized, full-width target', () => {
  const { container, liveRgb } = hero(false);
  const go = container.querySelector<HTMLElement>('.go-live')!;
  const rect = go.getBoundingClientRect();
  expect(rect.height).toBeGreaterThanOrEqual(52);
  expect(rect.width).toBeGreaterThan(300);
  expect(getComputedStyle(go).backgroundColor).toBe(liveRgb);
  const disc = container.querySelector<HTMLElement>('.disc .btn')!;
  expect(getComputedStyle(disc).backgroundColor).toBe(liveRgb);
  expect(disc.getBoundingClientRect().width).toBe(84);
  expect(getComputedStyle(disc, '::before').animationName).toBe('ring');
  expect(getComputedStyle(disc, '::after').animationName).toBe('ring');
});

it('the live disc stops pulsing while the listener is already on the broadcast', () => {
  const { container } = hero(true);
  const disc = container.querySelector<HTMLElement>('.disc .btn')!;
  expect(getComputedStyle(disc, '::before').content).toBe('none');
});

const luminance = (rgb: string) => {
  const [r, g, b] = rgb.match(/[\d.]+/g)!.slice(0, 3).map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

for (const colorScheme of ['light', 'dark'] as const) {
  it(`the listen button's words stay readable on the live colour in ${colorScheme} mode`, async () => {
    await commands.emulateMedia({ colorScheme });
    const { container } = hero(false);
    const go = getComputedStyle(container.querySelector('.go-live')!);
    expect(contrast(go.color, go.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  });
}

it('with reduced motion the rings hold still', async () => {
  await commands.emulateMedia({ reducedMotion: 'reduce' });
  const { container } = hero(false);
  const disc = container.querySelector<HTMLElement>('.disc .btn')!;
  expect(getComputedStyle(disc, '::before').animationName).toBe('none');
  expect(getComputedStyle(disc, '::after').animationName).toBe('none');
});

declare module 'vitest/browser' {
  interface BrowserCommands {
    emulateMedia: (media: { colorScheme?: 'light' | 'dark' | null; reducedMotion?: 'reduce' | 'no-preference' | null }) => Promise<void>;
  }
}
