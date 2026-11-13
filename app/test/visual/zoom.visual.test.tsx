import { cleanup, render } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import '../../src/styles/tokens.css';
import '../../src/styles/app.css';

vi.mock('../../src/platform', () => ({ nativeUI: () => true, isNative: () => false }));
vi.mock('../../src/push', () => ({ pushPermission: async () => 'prompt', askPermission: async () => 'granted' }));
vi.mock('../../src/pdf/cache', () => ({ getPdf: () => new Promise(() => {}), dropPdf: async () => {} }));

import { FIXTURE_STATE } from '../../src/dev/fixture-state';
import { Book } from '../../src/ui/Book';
import { Lesson } from '../../src/ui/Lesson';
import { NavBar } from '../../src/ui/NavBar';
import { Onboarding } from '../../src/ui/Onboarding';
import { PlayerBar } from '../../src/ui/MiniPlayer';
import { Defs } from '../../src/ui/Star';

const [tafsir] = FIXTURE_STATE.courses;
const noop = () => {};
const ticks = { read: new Set<string>(), reviewed: new Set<string>() };
const NOW = new Date('2026-11-02T18:10:00Z');
const touch = (el: Element) => getComputedStyle(el).touchAction;
const zooms = (el: Element) => ['auto', 'manipulation'].includes(touch(el)) || touch(el).includes('pinch-zoom');
const chain = (el: Element) => {
  const all: Element[] = [];
  for (let e: Element | null = el; e; e = e.parentElement) all.push(e);
  return all;
};

afterEach(cleanup);

it('the book zooms: nothing from its page up to the document stops a pinch', () => {
  const { container } = render(
    <div class="shell">
      <Defs />
      <Book course={tafsir} pdfIndex={0} page={1} marker ticks={ticks} onTick={noop} back="#/" />
    </div>,
  );
  const wrap = container.querySelector('.pdfwrap')!;
  expect(touch(wrap)).toContain('pinch-zoom');
  for (const el of chain(wrap)) expect(zooms(el), `${el.tagName}.${el.className}`).toBe(true);
});

it('nothing else zooms, by pinch or double-tap, and everything still scrolls: the lesson page, the player bar, the tabs', () => {
  const s = { src: { kind: 'recording' as const, url: 'about:blank', title: 'ت', subtitle: 'س' }, playing: false, position: 0, duration: 60, error: null };
  const { container } = render(
    <div class="shell">
      <Defs />
      <div class="scroll">
        <Lesson course={tafsir} live={FIXTURE_STATE.live} otherLive={null} ticks={ticks} now={NOW} listening={false} onTick={noop} onPlay={noop} onLive={noop} />
      </div>
      <PlayerBar s={s} act={{ toggle: noop, skip: noop, seek: noop }} />
      <NavBar route={{ name: 'course', id: tafsir.id }} tabs={[{ courseId: tafsir.id, slot: 'fajr', label: 'الفجر', live: false }]} />
    </div>,
  );
  for (const el of [container.querySelector('.scroll')!, container.querySelector('.mp')!, container.querySelector('.nav')!]) {
    expect(touch(el), el.className).toBe('pan-x pan-y');
  }
});

it('the onboarding does not zoom either: its screen only lets the page scroll vertically', () => {
  const { container } = render(
    <div class="shell">
      <Defs />
      <div class="scroll">
        <Onboarding state={FIXTURE_STATE} prefs={null} now={NOW} replay={false} backRef={{ current: null }} onDone={noop} onLeave={noop} />
      </div>
    </div>,
  );
  expect(touch(container.querySelector('.scroll')!)).toBe('pan-x pan-y');
  expect(touch(container.querySelector('.ob')!)).toBe('pan-y');
});
