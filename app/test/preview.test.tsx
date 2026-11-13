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

  it('then taps Mixlr’s play button, and the drawn player plays: stop button, waves moving; nothing is loaded', async () => {
    const pv = show('live');
    await after(4500);
    const mixlr = pv.querySelector<HTMLElement>('.pv-mixlr')!;
    expect(pv.dataset.focus).toBe('bottom');
    expect(mixlr.dataset.playing).toBeUndefined();
    expect(mixlr.querySelector('.mx-play use')!.getAttribute('href')).toBe('#play');
    await after(1000);
    expect(pv.dataset.tap).toBe('play');
    await after(400);
    expect(mixlr.dataset.playing).toBe('');
    expect(mixlr.querySelector('.mx-play use')!.getAttribute('href')).toBe('#i-stop');
    expect(pv.querySelector('iframe')).toBeNull();
    expect(pv.querySelector('audio')).toBeNull();
  });
});

describe('the recording preview', () => {
  it('highlights the recording card, taps «استمع», plays it in the app’s player to the end, then ticks «راجعتُه»', async () => {
    const pv = show('rec');
    await after(4400);
    expect(pv.dataset.spot).toBe('');
    const card = pv.querySelector('.pv-target')!;
    expect(card.textContent).toContain('التسجيل متاح');
    const tick = card.querySelector('.chip[aria-pressed]')!;
    expect(tick.getAttribute('aria-pressed')).toBe('false');
    expect(pv.querySelector('.mp')).toBeNull();
    await after(1100);
    expect(pv.dataset.tap).toBe('listen');
    await after(400);
    const bar = pv.querySelector('.pv-app > .mp')!;
    expect(bar.querySelector('.b')!.textContent).toBe(`${tafsir.title} · الدرس ٤٤٣`);
    expect(bar.querySelector('.mini')!.getAttribute('aria-label')).toBe('إيقاف مؤقت');
    expect(pv.dataset.focus).toBe('bottom');
    await after(2200);
    expect(bar.querySelector('.mini')!.getAttribute('aria-label')).toBe('تشغيل');
    expect(bar.querySelector<HTMLElement>('.prog')!.style.width).toBe('100%');
    expect(tick.getAttribute('aria-pressed')).toBe('false');
    await after(600);
    expect(pv.dataset.tap).toBe('tick');
    await after(400);
    expect(tick.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('the preparation preview', () => {
  it('opens the book at the next passage, marked, shows «قرأتُه» not yet ticked, then taps it and it shows read', async () => {
    const pv = show('prep');
    await after(3700);
    const book = pv.querySelector('.book')!;
    const next = tafsir.next!;
    expect(book.querySelector('.pdfbar .pill')!.textContent).toBe(`ص ${ar(printedPage(tafsir, next.pdfIndex ?? 0, next.startPage)!)}`);
    expect(book.querySelector('.mkbanner')!.textContent).toBe('بداية الدرس تقريبًا');
    const read = book.querySelector('.pdffoot .chip[aria-pressed]')!;
    expect(read.textContent).toContain('قرأتُه');
    expect(read.getAttribute('aria-pressed')).toBe('false');
    await after(800);
    expect(pv.dataset.focus).toBe('bottom');
    await after(1200);
    expect(pv.dataset.tap).toBe('tick');
    expect(read.getAttribute('aria-pressed')).toBe('false');
    await after(400);
    expect(read.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('a preparation reminder for a course without a book', () => {
  it('opens the lesson page on the next-lesson card, says so to screen readers, and never ticks «قرأتُه»', async () => {
    const bookless = { ...tafsir, pdfUrls: [] };
    const state = { ...FIXTURE_STATE, courses: [bookless] };
    const { container } = render(<Preview card={cardFor('prep', [bookless], state.live)!} state={state} now={NOW} />);
    const pv = container.querySelector<HTMLElement>('.pv')!;
    expect(pv.previousElementSibling!.textContent).toContain('صفحة الدرس');
    expect(pv.previousElementSibling!.textContent).not.toContain('الكتاب');
    await after(4400);
    expect(pv.querySelector('.pv-target')!.textContent).toContain('الدرس ٤٤٤');
    for (let ms = 0; ms < BEATS.page.at(-1)!.at; ms += 200) {
      await after(200);
      expect(pv.dataset.tap).not.toBe('tick');
      expect(pv.querySelector('.pv-target .chip[aria-pressed="true"]')).toBeNull();
    }
  });
});

describe('every preview', () => {
  it('starts again when the step changes, even to one that opens the same page', async () => {
    const bookless = { ...tafsir, pdfUrls: [] };
    const state = { ...FIXTURE_STATE, courses: [bookless] };
    const { container, rerender } = render(<Preview card={cardFor('rec', [bookless], state.live)!} state={state} now={NOW} />);
    await after(PLAYS * BEATS.review.at(-1)!.at + 10);
    expect(container.querySelector<HTMLElement>('.pv')!.dataset.still).toBe('');
    rerender(<Preview card={cardFor('prep', [bookless], state.live)!} state={state} now={NOW} />);
    const pv = container.querySelector<HTMLElement>('.pv')!;
    expect(pv.dataset.to).toBe('lesson');
    expect(pv.dataset.still).toBeUndefined();
    expect(pv.dataset.banner).toBe('hidden');
  });

  it(`plays ${PLAYS} times, then rests in the app, on the book with «قرأتُه» ticked, and stops its timers`, async () => {
    const pv = show('prep');
    await after(PLAYS * BEATS.book.at(-1)!.at + 10);
    expect(pv.dataset.still).toBe('');
    expect(pv.dataset.banner).not.toBe('big');
    expect(pv.querySelector('.book .pdffoot .chip[aria-pressed]')!.getAttribute('aria-pressed')).toBe('true');
    expect(vi.getTimerCount()).toBe(0);
  });

  const reduceMotion = () =>
    (window.matchMedia = ((q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)', addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia);

  it('with reduced motion shows the end at once, Mixlr playing with no notification, and sets no timer', () => {
    reduceMotion();
    const pv = show('live');
    expect(pv.dataset.still).toBe('');
    expect(pv.dataset.banner).not.toBe('big');
    expect(pv.querySelector('.pv-mixlr')!.hasAttribute('data-playing')).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('with reduced motion the recording rests listened to and ticked, the player bar at its end', () => {
    reduceMotion();
    const pv = show('rec');
    expect(pv.dataset.banner).not.toBe('big');
    expect(pv.querySelector('.pv-target .chip[aria-pressed]')!.getAttribute('aria-pressed')).toBe('true');
    expect(pv.querySelector<HTMLElement>('.mp .prog')!.style.width).toBe('100%');
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
