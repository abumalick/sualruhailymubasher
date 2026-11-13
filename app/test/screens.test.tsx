import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateDTO } from '@albadr/shared';

const store = new Map<string, string>();
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => void store.set(key, value),
    remove: async ({ key }: { key: string }) => void store.delete(key),
    keys: async () => ({ keys: [...store.keys()] }),
  },
}));
vi.mock('../src/api', () => ({ loadCachedState: vi.fn(), fetchState: vi.fn(), fetchLessons: vi.fn() }));

import * as api from '../src/api';
import { App } from '../src/App';
import { FIXTURE_STATE } from '../src/dev/fixture-state';
import type { Ticks } from '../src/logic/ticks';
import { Courses } from '../src/ui/Courses';
import { Home } from '../src/ui/Home';
import { liveState, TAFSIR, TAWHID } from './live-state';

const MON_2110 = new Date('2026-11-02T18:10:00Z');
const MON_0940 = new Date('2026-11-02T06:40:00Z');
const none = (): Ticks => ({ read: new Set(), reviewed: new Set() });
const noop = () => {};
const live = (courseId: string | null): StateDTO => ({
  ...FIXTURE_STATE,
  live: { ...FIXTURE_STATE.live, isLive: true, courseId, startedAt: '2026-11-02T02:25:00Z' },
});
const tafsir = FIXTURE_STATE.courses[0];

function home(state: StateDTO, now: Date, extra: Partial<Parameters<typeof Home>[0]> = {}) {
  return render(
    <Home state={state} ticks={none()} now={now} error={false} onTick={noop} onPlay={noop} onLive={noop} {...extra} />,
  );
}

beforeEach(() => store.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(api.fetchLessons).mockReset();
});

describe('Home hero', () => {
  it('Mon 21:10 -> prepare for tomorrow Fajr with the book at the expected page', () => {
    home(FIXTURE_STATE, MON_2110);
    expect(screen.getByText('حضّر لدرس الفجر غدًا')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'شرح تفسير السعدي' })).toBeTruthy();
    expect(screen.getByText('يتابع من حيث توقف الدرس ٤٤٣ · إلى نحو ص ٣١٤')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'اقرأ في الكتاب · ص ٣١٢' }).getAttribute('href')).toBe('#/book/tafsir-saadi/0/312?marker=1');
    expect(screen.getByRole('button', { name: 'قرأتُه' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('Mon 09:40 -> review of lesson 443 with listen, book and reviewed tick', () => {
    const onPlay = vi.fn();
    home(FIXTURE_STATE, MON_0940, { onPlay });
    expect(screen.getByText('راجع درس الفجر · التسجيل متاح')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'شرح تفسير السعدي · الدرس ٤٤٣' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'الكتاب · ص ٣١٠' }).getAttribute('href')).toBe('#/book/tafsir-saadi/0/310');
    expect(screen.getByRole('button', { name: 'راجعتُه' })).toBeTruthy();
    fireEvent.click(screen.getByText('استمع'));
    expect(onPlay.mock.calls[0][0].number).toBe(443);
  });

  it('live hero follows the lesson on air after next has moved on to the following lesson', () => {
    const flipped = { ...TAWHID, next: { ...TAWHID.next!, date: '2026-11-03', number: 16, startPoint: null, startPage: 285, estEndPage: 290, estimated: true } };
    const state: StateDTO = { ...liveState('kitab-tawhid'), courses: [TAFSIR, flipped] };
    home(state, new Date('2026-11-02T18:00:00Z'));
    expect(screen.getByText('الدرس ١٥ · من قوله: <فيه مسائل: الأولى: الخوف من الشرك>…')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'تابع في الكتاب · ص ٢٧٨' }).getAttribute('href')).toBe('#/book/kitab-tawhid/0/280?marker=1');
    expect(screen.queryByText(/الدرس ١٦/)).toBeNull();
  });

  it('Tafsir live hero shows the printed page and edition instead of a book button', () => {
    home(liveState('tafsir-saadi'), new Date('2026-11-03T03:00:00Z'));
    expect(screen.getByText(/^الدرس ٤٦٠ · تفسير سورة التوبة/)).toBeTruthy();
    expect(screen.getByText('ص ٦٣٦ · طبعة دار ابن الجوزي')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /تابع في الكتاب/ })).toBeNull();
  });

  it('live with a course names the slot; live without a course says only مباشر الآن', () => {
    home(live('tafsir-saadi'), MON_0940);
    expect(screen.getByText('مباشر الآن · درس الفجر')).toBeTruthy();
    cleanup();
    home(live(null), MON_0940);
    expect(screen.getByText('مباشر الآن')).toBeTruthy();
  });

  it('live hero: tag above a pulsing live disc and a worded listen button, both opening the broadcast', () => {
    const onLive = vi.fn();
    const { container } = home(live('tafsir-saadi'), MON_0940, { onLive });
    const hero = container.querySelector('.hero')!;
    const tag = hero.querySelector('.tag.live')!;
    const disc = hero.querySelector('.disc')!;
    expect(tag.compareDocumentPosition(disc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(disc.classList.contains('live')).toBe(true);
    expect(disc.classList.contains('pulse')).toBe(true);
    const discBtn = disc.querySelector('button')!;
    expect(discBtn.getAttribute('aria-hidden')).toBe('true');
    expect(discBtn.tabIndex).toBe(-1);
    expect(screen.getAllByRole('button', { name: /استمع إلى البث/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'استمع إلى البث المباشر' }));
    fireEvent.click(discBtn);
    expect(onLive).toHaveBeenCalledTimes(2);
  });

  it('live hero while already listening stops pulsing and says so', () => {
    const onLive = vi.fn();
    const { container } = home(live('tafsir-saadi'), MON_0940, { onLive, listening: true });
    expect(container.querySelector('.disc')!.classList.contains('pulse')).toBe(false);
    expect(screen.queryByRole('button', { name: 'استمع إلى البث المباشر' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'تستمع الآن إلى البث' }));
    expect(onLive).toHaveBeenCalled();
  });

  it('other hero states keep the plain disc', () => {
    const { container } = home(FIXTURE_STATE, MON_0940);
    const disc = container.querySelector('.hero .disc')!;
    expect(disc.classList.contains('live')).toBe(false);
    expect(disc.querySelector('button')!.getAttribute('aria-hidden')).toBeNull();
  });

  it("today's list marks the lesson on air with the live pill", () => {
    const { container } = home(live('tafsir-saadi'), new Date('2026-11-02T02:40:00Z'));
    const pill = [...container.querySelectorAll('.pill')].find((e) => e.textContent === 'مباشر');
    expect(pill?.classList.contains('live')).toBe(true);
  });

  it("during a broadcast, the lesson on air in today's list opens the live player instead of leaving for its course page", () => {
    const onLive = vi.fn();
    home(live('tafsir-saadi'), new Date('2026-11-02T02:40:00Z'), { onLive });
    expect(screen.queryByRole('link', { name: /شرح تفسير السعدي/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /بعد الفجر.*مباشر/ }));
    expect(onLive).toHaveBeenCalledOnce();
  });

  it('a course of the day that is not on air still opens its course page', () => {
    home(live('tafsir-saadi'), new Date('2026-11-02T02:40:00Z'));
    expect(screen.getByRole('link', { name: /كتاب التوحيد/ }).getAttribute('href')).toBe('#/course/kitab-tawhid');
  });

  it('a course without PDFs shows no book button', () => {
    const state = { ...FIXTURE_STATE, courses: [{ ...tafsir, pdfUrls: [] }, FIXTURE_STATE.courses[1]] };
    home(state, MON_2110);
    expect(screen.getByText('حضّر لدرس الفجر غدًا')).toBeTruthy();
    expect(screen.queryByText(/اقرأ في الكتاب/)).toBeNull();
  });

  it('an unlinked book shows the page in its edition instead of a book button', () => {
    const state = { ...FIXTURE_STATE, courses: [{ ...tafsir, pdfUrls: [], edition: 'طبعة دار ابن الجوزي' }, FIXTURE_STATE.courses[1]] };
    home(state, MON_2110);
    expect(screen.getByText('ص ٣١٢ · طبعة دار ابن الجوزي')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /الكتاب/ })).toBeNull();
  });

  it('unknown pages still open the book at page 1 of the volume, without the marker', () => {
    const blank = (c: (typeof FIXTURE_STATE.courses)[number]) => ({
      ...c,
      latest: c.latest.map((l) => ({ ...l, pdfIndex: null, startPage: null, endPage: null })),
      next: { ...c.next!, pdfIndex: null, startPage: null, estEndPage: null },
    });
    const state = { ...FIXTURE_STATE, courses: FIXTURE_STATE.courses.map(blank) };
    home(state, MON_2110);
    expect(screen.getAllByRole('link', { name: 'افتح الكتاب' }).map((a) => a.getAttribute('href'))).toContain('#/book/tafsir-saadi/0/1');
    expect(screen.queryByText(/اقرأ في الكتاب · ص/)).toBeNull();
    cleanup();
    home(state, MON_0940);
    expect(screen.getByRole('link', { name: 'افتح الكتاب' }).getAttribute('href')).toBe('#/book/tafsir-saadi/0/1');
  });

  it('prepare cards carry a read tick even when not done', () => {
    const onTick = vi.fn();
    home(FIXTURE_STATE, MON_0940, { onTick });
    const ticks = screen.getAllByRole('button', { name: 'قرأتُه' });
    expect(ticks.length).toBe(2);
    expect(ticks.every((t) => t.getAttribute('aria-pressed') === 'false')).toBe(true);
    fireEvent.click(ticks[0]);
    expect(onTick).toHaveBeenCalledWith('read', 'kitab-tawhid', 3);
  });

  it('first launch offline without cache offers a retry', () => {
    const onRetry = vi.fn();
    render(<Home state={null} ticks={none()} now={MON_0940} error onTick={noop} onPlay={noop} onLive={noop} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows the Medina hijri date in the header', () => {
    home(FIXTURE_STATE, MON_0940);
    expect(document.querySelector('.head .date')?.textContent).toBe('الاثنين٢٢ جمادى الأولى');
  });
});

describe('Kitab at-Tawhid page numbers (PDF page = printed page + 2)', () => {
  const tawhidOnly: StateDTO = { ...FIXTURE_STATE, courses: [TAWHID], live: { ...FIXTURE_STATE.live, isLive: false } };

  it('prepare hero shows the printed page and opens the matching PDF page', () => {
    home(tawhidOnly, new Date('2026-11-02T10:00:00Z'), { ticks: { read: new Set(), reviewed: new Set(['kitab-tawhid:14']) } });
    expect(screen.getByText('حضّر لدرس المغرب اليوم')).toBeTruthy();
    expect(screen.getByText(/إلى نحو ص ٢٨٣$/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'اقرأ في الكتاب · ص ٢٧٨' }).getAttribute('href')).toBe('#/book/kitab-tawhid/0/280?marker=1');
  });

  it('review hero and list show the printed start page of the recorded lesson', () => {
    home(tawhidOnly, new Date('2026-11-02T06:40:00Z'));
    expect(screen.getByRole('link', { name: 'الكتاب · ص ٢٧٣' }).getAttribute('href')).toBe('#/book/kitab-tawhid/0/275');
  });
});

describe('App boot', () => {
  it('renders the cached state, shows the refresh error, and saves the read tick when tapped', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(MON_2110);
    store.set('topics', '[]');
    vi.mocked(api.loadCachedState).mockResolvedValue(FIXTURE_STATE);
    vi.mocked(api.fetchState).mockRejectedValue(new Error('offline'));
    render(<App />);
    const read = await screen.findByRole('button', { name: 'قرأتُه' });
    expect(await screen.findByText('تعذّر التحديث')).toBeTruthy();
    fireEvent.click(read);
    await waitFor(() => expect(store.get('read:tafsir-saadi:444')).toBe('1'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'قرأتُه' }).getAttribute('aria-pressed')).toBe('true'));
  });
});

describe('Courses tab', () => {
  it('links every course to its page', () => {
    render(<Courses state={FIXTURE_STATE} />);
    expect(screen.getByRole('link', { name: /شرح تفسير السعدي/ }).getAttribute('href')).toBe('#/course/tafsir-saadi');
    expect(screen.getByRole('link', { name: /كتاب التوحيد/ }).getAttribute('href')).toBe('#/course/kitab-tawhid');
  });
});
