import { cleanup, render } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import '../../src/styles/tokens.css';
import '../../src/styles/app.css';
import type { CourseDTO } from '@sualruhaily/shared';
import { FIXTURE_STATE } from '../../src/dev/fixture-state';
import { Lesson } from '../../src/ui/Lesson';
import { NavBar } from '../../src/ui/NavBar';
import { Defs } from '../../src/ui/Star';
import { TAFSIR, TAWHID } from '../live-state';

afterEach(async () => {
  cleanup();
  document.body.style.width = '';
  await commands.emulateMedia({ colorScheme: null });
});

function page(course: CourseDTO) {
  document.documentElement.dir = 'rtl';
  document.body.style.width = '390px';
  return render(
    <div class="shell lat">
      <Defs />
      <div class="scroll">
        <Lesson
          course={course}
          live={FIXTURE_STATE.live}
          otherLive={null}
          ticks={{ read: new Set(), reviewed: new Set() }}
          now={new Date('2026-11-02T06:40:00Z')}
          listening={false}
          onTick={() => {}}
          onPlay={() => {}}
          onLive={() => {}}
        />
      </div>
      <NavBar
        route={{ name: 'course', id: course.id }}
        tabs={[
          { courseId: 'kitab-tawhid', slot: 'fajr', label: 'الفجر', live: false },
          { courseId: 'kabair', slot: 'asr', label: 'العصر', live: true },
        ]}
      />
    </div>,
  );
}

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
const bodyBg = () => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
const rgbOf = (css: string) => {
  const probe = document.createElement('i');
  probe.style.color = css;
  document.body.append(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  return rgb;
};

for (const colorScheme of ['light', 'dark'] as const) {
  it(`the two lesson titles render in different, readable colours in ${colorScheme} mode`, async () => {
    await commands.emulateMedia({ colorScheme });
    const colours = [TAFSIR, TAWHID].map((c) => {
      const { container, unmount } = page(c);
      const h1 = getComputedStyle(container.querySelector('h1')!);
      const tab = getComputedStyle(container.querySelector('.nav a.on')!);
      const out = { title: h1.color, tab: tab.color, font: h1.fontFamily };
      unmount();
      return out;
    });
    expect(colours[0].title).not.toBe(colours[1].title);
    for (const c of colours) {
      expect(c.tab).toBe(c.title);
      expect(c.font).toMatch(/Aref Ruqaa/);
      expect(contrast(c.title, rgbOf(bodyBg()))).toBeGreaterThanOrEqual(3);
    }
  });
}

it('a lesson page has no horizontal overflow at 390px', () => {
  for (const c of [TAFSIR, TAWHID]) {
    const { container, unmount } = page(c);
    const scroll = container.querySelector<HTMLElement>('.scroll')!;
    expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth);
    expect(container.querySelector<HTMLElement>('.nav')!.scrollWidth).toBeLessThanOrEqual(390);
    unmount();
  }
});

it('the tab of the lesson on air carries a red dot', () => {
  const { container } = page(TAFSIR);
  const dot = container.querySelector<HTMLElement>('.nav .ld')!;
  expect(getComputedStyle(dot).backgroundColor).toBe(rgbOf(getComputedStyle(document.documentElement).getPropertyValue('--live').trim()));
  expect(dot.getBoundingClientRect().width).toBe(9);
});

declare module 'vitest/browser' {
  interface BrowserCommands {
    emulateMedia: (media: { colorScheme?: 'light' | 'dark' | null; reducedMotion?: 'reduce' | 'no-preference' | null }) => Promise<void>;
  }
}
