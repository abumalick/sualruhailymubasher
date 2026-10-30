import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonDTO, StateDTO } from '@albadr/shared';

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
import { Course } from '../src/ui/Course';
import { Courses } from '../src/ui/Courses';
import { Home } from '../src/ui/Home';

const MON_2110 = new Date('2026-11-02T18:10:00Z');
const MON_0940 = new Date('2026-11-02T06:40:00Z');
const none = (): Ticks => ({ read: new Set(), reviewed: new Set() });
const noop = () => {};
const live = (courseId: string | null): StateDTO => ({
  ...FIXTURE_STATE,
  live: { ...FIXTURE_STATE.live, isLive: true, courseId, startedAt: '2026-11-02T02:25:00Z' },
});
const tafsir = FIXTURE_STATE.courses[0];
const lesson = (number: number): LessonDTO => ({ ...tafsir.latest[0], number, startPoint: `سورة الأنفال ${number}` });

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

  it('live with a course names the slot; live without a course says only مباشر الآن', () => {
    const onLive = vi.fn();
    home(live('tafsir-saadi'), MON_0940, { onLive });
    expect(screen.getByText('مباشر الآن · درس الفجر')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'استمع إلى البث' }));
    expect(onLive).toHaveBeenCalled();
    cleanup();
    home(live(null), MON_0940);
    expect(screen.getByText('مباشر الآن')).toBeTruthy();
  });

  it('a course without PDFs shows no book button', () => {
    const state = { ...FIXTURE_STATE, courses: [{ ...tafsir, pdfUrls: [] }, FIXTURE_STATE.courses[1]] };
    home(state, MON_2110);
    expect(screen.getByText('حضّر لدرس الفجر غدًا')).toBeTruthy();
    expect(screen.queryByText(/اقرأ في الكتاب/)).toBeNull();
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

describe('App boot', () => {
  it('renders the cached state, shows the refresh error, and saves the read tick when tapped', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(MON_2110);
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

describe('Course page', () => {
  let observer: { cb: (entries: { isIntersecting: boolean }[]) => void } | null = null;
  beforeEach(() => {
    observer = null;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        cb: (entries: { isIntersecting: boolean }[]) => void;
        constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
          this.cb = cb;
          observer = this;
        }
        observe() {}
        disconnect() {}
      },
    );
  });
  const titles = () => screen.getAllByText(/^الدرس [٠-٩]+$/).map((e) => e.textContent);

  it('lists recordings newest first with reviewed ticks and loads older ones at the end', async () => {
    vi.mocked(api.fetchLessons).mockResolvedValue([lesson(440), lesson(439)]);
    const ticks: Ticks = { read: new Set(), reviewed: new Set(['tafsir-saadi:443']) };
    render(<Course course={tafsir} ticks={ticks} onTick={noop} onPlay={noop} />);
    expect(titles()).toEqual(['الدرس ٤٤٣', 'الدرس ٤٤٢', 'الدرس ٤٤١']);
    expect(screen.getAllByRole('button', { name: 'راجعتُه' }).map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(screen.getByRole('link', { name: 'الكتاب · ص ٣١٢' }).getAttribute('href')).toBe('#/book/tafsir-saadi/0/312?marker=1');
    await act(async () => observer!.cb([{ isIntersecting: true }]));
    expect(api.fetchLessons).toHaveBeenCalledWith('tafsir-saadi', 441);
    await waitFor(() => expect(titles()).toEqual(['الدرس ٤٤٣', 'الدرس ٤٤٢', 'الدرس ٤٤١', 'الدرس ٤٤٠', 'الدرس ٤٣٩']));
  });

  it('unknown page: one button per volume at page 1, or a single book button', () => {
    const tawhid = FIXTURE_STATE.courses[1];
    const blank = { ...tawhid, latest: tawhid.latest.map((l) => ({ ...l, startPage: null, endPage: null })), next: { ...tawhid.next!, startPage: null } };
    render(<Course course={blank} ticks={none()} onTick={noop} onPlay={noop} />);
    expect(['الجزء ١', 'الجزء ٢', 'الجزء ٣'].map((n) => screen.getByRole('link', { name: n }).getAttribute('href'))).toEqual([
      '#/book/kitab-tawhid/0/1',
      '#/book/kitab-tawhid/1/1',
      '#/book/kitab-tawhid/2/1',
    ]);
    cleanup();
    const single = { ...tafsir, latest: tafsir.latest.map((l) => ({ ...l, startPage: null, endPage: null })), next: { ...tafsir.next!, startPage: null } };
    render(<Course course={single} ticks={none()} onTick={noop} onPlay={noop} />);
    expect(screen.getByRole('link', { name: 'افتح الكتاب' }).getAttribute('href')).toBe('#/book/tafsir-saadi/0/1');
  });

  it('a course with no lessons and no next lesson renders without crashing', () => {
    render(<Course course={{ ...tafsir, latest: [], next: null }} ticks={none()} onTick={noop} onPlay={noop} />);
    expect(screen.getByText('لا يوجد درس قادم مجدول')).toBeTruthy();
    expect(screen.queryByText(/^الدرس [٠-٩]+$/)).toBeNull();
  });
});

describe('Courses tab', () => {
  it('links every course to its page', () => {
    render(<Courses state={FIXTURE_STATE} />);
    expect(screen.getByRole('link', { name: /شرح تفسير السعدي/ }).getAttribute('href')).toBe('#/course/tafsir-saadi');
    expect(screen.getByRole('link', { name: /كتاب التوحيد/ }).getAttribute('href')).toBe('#/course/kitab-tawhid');
  });
});
