import { cleanup, render } from '@testing-library/preact';
import type { ComponentChildren } from 'preact';
import { afterEach, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { fontsLoaded } from './fonts';
import '../../src/styles/tokens.css';
import '../../src/styles/app.css';
import pdfUrl from './fixtures/tawhid-v1-p235.pdf?url';

vi.mock('../../src/platform', () => ({ nativeUI: () => true, isNative: () => false }));
vi.mock('../../src/push', () => ({ pushPermission: async () => 'prompt', askPermission: async () => 'granted' }));
vi.mock('../../src/pdf/cache', () => ({
  getPdf: async () => new Uint8Array(await (await fetch(pdfUrl)).arrayBuffer()),
  dropPdf: async () => {},
}));
vi.mock('../../src/audio/player', () => ({
  player: {
    state: {
      src: { kind: 'recording', url: 'about:blank', title: 'شرح تفسير السعدي · الدرس ٤٥٩', subtitle: 'تفسير سورة التوبة: من الآية (١)' },
      playing: true,
      position: 120,
      duration: 3600,
      error: null,
    },
    onChange: () => () => {},
    pause: () => {},
    resume: async () => {},
    startEmbed: () => {},
    endEmbed: () => {},
  },
}));

import { FIXTURE_STATE } from '../../src/dev/fixture-state';
import { About } from '../../src/ui/About';
import { Book } from '../../src/ui/Book';
import { Lesson } from '../../src/ui/Lesson';
import { Links } from '../../src/ui/Links';
import { LiveSheet } from '../../src/ui/LiveSheet';
import { MiniPlayer } from '../../src/ui/MiniPlayer';
import { More } from '../../src/ui/More';
import { NavBar } from '../../src/ui/NavBar';
import { Notifications } from '../../src/ui/Notifications';
import { Onboarding } from '../../src/ui/Onboarding';
import { Defs } from '../../src/ui/Star';
import { liveDTO, liveState, TAFSIR, TAWHID } from '../live-state';

const HEIGHT = 844;
const CAPTION_MIN = 13;
const noop = () => {};
const ticks = { read: new Set<string>(), reviewed: new Set<string>() };
const tabs = [
  { courseId: 'tafsir-saadi', slot: 'fajr' as const, label: 'الفجر', live: false },
  { courseId: 'kitab-tawhid', slot: 'maghrib' as const, label: 'المغرب', live: true },
];
const embed = { isLive: true, mode: 'embed' as const, embedUrl: 'about:blank#mixlr', streamUrl: null, courseId: 'kitab-tawhid', startedAt: '2026-11-02T15:00:00Z' };

afterEach(() => {
  cleanup();
  document.body.style.width = '';
});

const shell = (body: ComponentChildren, after?: ComponentChildren) => (
  <div class="shell lat" style={`height:${HEIGHT}px`}>
    <Defs />
    <div class="scroll">{body}</div>
    {after}
  </div>
);

const lesson = (course = TAWHID, live = liveDTO('kitab-tawhid'), otherLive: { course: typeof TAFSIR | null } | null = null) => (
  <Lesson course={course} live={live} otherLive={otherLive} ticks={ticks} now={new Date('2026-11-02T18:00:00Z')} listening={false} onTick={noop} onPlay={noop} onLive={noop} />
);

const screens: Record<string, { node: () => ComponentChildren; steps?: number; ready?: string }> = {
  'the lesson page with the live hero': { node: () => shell(lesson(), <NavBar route={{ name: 'course', id: 'kitab-tawhid' }} tabs={tabs} />) },
  'the lesson page with another lesson on air': {
    node: () => shell(lesson(TAFSIR, liveDTO('kitab-tawhid'), { course: TAWHID }), <><MiniPlayer /><NavBar route={{ name: 'course', id: 'tafsir-saadi' }} tabs={tabs} /></>),
  },
  'the more page': { node: () => shell(<More />, <NavBar route={{ name: 'more' }} tabs={tabs} />) },
  'the notifications page': {
    node: () => shell(<Notifications state={liveState('kitab-tawhid')} prefs={{ wanted: ['live-other'], known: [] }} onToggle={noop} />),
    ready: '.card.reach',
  },
  'the links page': { node: () => shell(<Links state={FIXTURE_STATE} />) },
  'the about page': { node: () => shell(<About native />) },
  'the live player, open': {
    node: () => <LiveSheet live={embed} course={TAWHID} startedAt={embed.startedAt} expanded onExpand={noop} onCollapse={noop} onClose={noop} />,
  },
  'the live player, minimised': {
    node: () => shell(lesson(TAFSIR), <LiveSheet live={embed} course={TAWHID} startedAt={embed.startedAt} expanded={false} onExpand={noop} onCollapse={noop} onClose={noop} />),
  },
  'the book': {
    node: () => (
      <div class="shell" style={`height:${HEIGHT}px`}>
        <Defs />
        <Book course={{ ...TAWHID, pdfUrls: ['https://example.invalid/tawhid-1.pdf'] }} pdfIndex={0} page={1} marker ticks={ticks} onTick={noop} back="#/" />
      </div>
    ),
    ready: '.pdffoot',
  },
};
const onboarding = (steps: number) => ({
  node: () =>
    shell(<Onboarding state={FIXTURE_STATE} prefs={null} now={new Date('2026-11-02T18:10:00Z')} replay={false} backRef={{ current: null }} onDone={noop} onLeave={noop} />),
  steps,
});
screens['the onboarding app screen'] = onboarding(0);
screens['the onboarding live step'] = onboarding(1);
screens['the onboarding revision step'] = onboarding(2);
screens['the onboarding preparation step'] = onboarding(3);

async function show(width: number, s: (typeof screens)[string]) {
  await page.viewport(width, HEIGHT);
  document.documentElement.dir = 'rtl';
  document.body.style.width = `${width}px`;
  const { container } = render(<>{s.node()}</>);
  for (let i = 0; i < (s.steps ?? 0); i++) {
    const heading = container.querySelector('h3')!.textContent;
    await userEvent.click(page.getByRole('button', { name: 'متابعة' }));
    await expect.poll(() => container.querySelector('h3')!.textContent).not.toBe(heading);
  }
  for (const a of container.querySelector('.obstep')?.getAnimations() ?? []) a.finish();
  await fontsLoaded();
  if (s.ready) await expect.poll(() => container.querySelector(s.ready!), { timeout: 20_000 }).toBeTruthy();
  return container;
}

const ownText = (el: Element) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== '');
const visible = (el: Element) => el.getBoundingClientRect().width > 0;
const lines = (el: Element) => {
  const tops: number[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.width > 0) tops.push(r.top);
  }
  const half = parseFloat(getComputedStyle(el).fontSize) / 2;
  return tops.sort((a, b) => a - b).filter((t, i, all) => i === 0 || t - all[i - 1] > half).length;
};
// Labels that must stay on one line, and one-line bar titles that must keep room to show their words.
const ONE_LINE = '.chip, .pill, .tag, .nav a, .cycle i, .sec small, .pv-cap';
const ROOMY = '.mp .t, .lbar .t, .pdfbar .t';
const ROOM_PX = 110;

for (const width of [320, 360, 390]) {
  for (const [name, s] of Object.entries(screens)) {
    it(`${name} at ${width}px: no text under ${CAPTION_MIN}px, nothing past the screen's edges`, async () => {
      const c = await show(width, s);
      const small = [...c.querySelectorAll('*')]
        .filter((el) => ownText(el) && visible(el) && parseFloat(getComputedStyle(el).fontSize) < CAPTION_MIN)
        .map((el) => `${el.tagName.toLowerCase()}.${el.className} ${getComputedStyle(el).fontSize} "${el.textContent!.trim().slice(0, 20)}"`);
      expect(small).toEqual([]);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
      const outside = [...c.querySelectorAll('*')]
        .filter((el) => visible(el) && !el.closest('svg, canvas, .pdfwrap'))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.right > width + 0.5 || r.left < -0.5;
        })
        .map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
      expect(outside).toEqual([]);
      const wrapped = [...c.querySelectorAll(ONE_LINE)].filter((el) => visible(el) && lines(el) > 1).map((el) => `${el.className} "${el.textContent!.trim()}"`);
      expect(wrapped).toEqual([]);
      const cramped = [...c.querySelectorAll(ROOMY)].filter((el) => el.getBoundingClientRect().width < ROOM_PX).map((el) => `${el.parentElement!.className} .${el.className} ${Math.round(el.getBoundingClientRect().width)}px`);
      expect(cramped).toEqual([]);
    }, 60_000);
  }
}
