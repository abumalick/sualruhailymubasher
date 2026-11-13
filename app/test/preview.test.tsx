import { act, cleanup, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { cardFor } from '../src/logic/onboarding';
import { BEATS, PLAYS } from '../src/logic/preview';
import { ar, printedPage } from '../src/ui/format';
import { Preview } from '../src/ui/Preview';

const [tafsir] = FIXTURE_STATE.courses;
const NOW = new Date('2026-11-02T18:10:00Z');
const realMatchMedia = window.matchMedia;

beforeEach(() => vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.matchMedia = realMatchMedia;
});

function show(step: 'live' | 'rec' | 'prep') {
  const { container } = render(<Preview card={cardFor(step, [tafsir], FIXTURE_STATE.live)!} state={FIXTURE_STATE} now={NOW} />);
  return container.querySelector<HTMLElement>('.pv')!;
}
const after = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('the live preview', () => {
  it('grows the notification, taps it, then opens the live player over the lesson', async () => {
    const pv = show('live');
    expect(pv.dataset.banner).toBe('hidden');
    await after(1400);
    expect(pv.dataset.banner).toBe('big');
    await after(1400);
    expect(pv.dataset.tap).toBe('banner');
    expect(pv.querySelector('.sheet')).toBeNull();
    await after(900);
    expect(pv.dataset.banner).toBe('gone');
    const sheet = pv.querySelector('.sheet')!;
    expect(sheet.querySelector('.lhead b')!.textContent).toBe(tafsir.title);
    expect(sheet.textContent).toContain('يبدأ الدرس من');
  });

  it('draws the Mixlr player and never loads it', async () => {
    const pv = show('live');
    await after(4000);
    expect(pv.querySelector('.pv-mixlr')).toBeTruthy();
    expect(pv.querySelector('iframe')).toBeNull();
  });
});

describe('the recording preview', () => {
  it('scrolls the lesson page to its recording card, highlights it, and a ghost tap ticks «راجعتُه»', async () => {
    const pv = show('rec');
    await after(4400);
    expect(pv.dataset.spot).toBe('');
    const card = pv.querySelector('.pv-target')!;
    expect(card.textContent).toContain('التسجيل متاح');
    const tick = card.querySelector('.chip[aria-pressed]')!;
    expect(tick.getAttribute('aria-pressed')).toBe('false');
    await after(1700);
    expect(pv.dataset.tap).toBe('tick');
    await after(400);
    expect(tick.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('the preparation preview', () => {
  it('opens the book at the next passage, marked, and only shows it', async () => {
    const pv = show('prep');
    await after(3700);
    const book = pv.querySelector('.book')!;
    const next = tafsir.next!;
    expect(book.querySelector('.pdfbar .pill')!.textContent).toBe(`ص ${ar(printedPage(tafsir, next.pdfIndex ?? 0, next.startPage)!)}`);
    expect(book.querySelector('.mkbanner')!.textContent).toBe('بداية الدرس تقريبًا');
    await after(2400);
    expect(pv.dataset.tap).toBeUndefined();
    expect(book.querySelector('.pdffoot .chip[aria-pressed]')!.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('every preview', () => {
  it('starts again when the step changes, even to one that opens the same page', async () => {
    const bookless = { ...tafsir, pdfUrls: [] };
    const state = { ...FIXTURE_STATE, courses: [bookless] };
    const { container, rerender } = render(<Preview card={cardFor('rec', [bookless], state.live)!} state={state} now={NOW} />);
    await after(PLAYS * BEATS.lesson.at(-1)!.at + 10);
    expect(container.querySelector<HTMLElement>('.pv')!.dataset.still).toBe('');
    rerender(<Preview card={cardFor('prep', [bookless], state.live)!} state={state} now={NOW} />);
    const pv = container.querySelector<HTMLElement>('.pv')!;
    expect(pv.dataset.to).toBe('lesson');
    expect(pv.dataset.still).toBeUndefined();
    expect(pv.dataset.banner).toBe('hidden');
  });

  it(`plays ${PLAYS} times, then rests on the still frame and stops its timers`, async () => {
    const pv = show('prep');
    await after(PLAYS * BEATS.book.at(-1)!.at + 10);
    expect(pv.dataset.still).toBe('');
    expect(pv.dataset.banner).toBe('big');
    expect(pv.querySelector('.book')).toBeTruthy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('with reduced motion shows the still frame at once and sets no timer', () => {
    window.matchMedia = ((q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)', addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    const pv = show('live');
    expect(pv.dataset.still).toBe('');
    expect(pv.dataset.banner).toBe('big');
    expect(pv.querySelector('.sheet')).toBeTruthy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores taps: inert, hidden from screen readers, with one sentence for them outside it', () => {
    const pv = show('rec');
    expect(pv.hasAttribute('inert')).toBe(true);
    expect(pv.getAttribute('aria-hidden')).toBe('true');
    expect(pv.previousElementSibling!.className).toBe('sr');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    pv.querySelector('.pv-banner')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
