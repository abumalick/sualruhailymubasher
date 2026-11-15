import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toArabicDigits, type CourseDTO, type LessonDTO, type LiveDTO } from '@sualruhaily/shared';

vi.mock('../src/api', () => ({ loadCachedState: vi.fn(), fetchState: vi.fn(), fetchLessons: vi.fn() }));

import * as api from '../src/api';
import { FIXTURE_STATE } from '../src/dev/fixture-state';
import type { Ticks } from '../src/logic/ticks';
import { Lesson, type LessonProps } from '../src/ui/Lesson';
import { liveDTO, TAFSIR, TAWHID } from './live-state';

const [tafsir, tawhid] = FIXTURE_STATE.courses;
const quiet: LiveDTO = FIXTURE_STATE.live;
const MON_0940 = new Date('2026-11-02T06:40:00Z');
const MON_1900 = new Date('2026-11-02T16:00:00Z');
const MON_2110 = new Date('2026-11-02T18:10:00Z');
const none = (): Ticks => ({ read: new Set(), reviewed: new Set() });
const noop = () => {};
const lesson = (number: number): LessonDTO => ({ ...tafsir.latest[0], number, sectionNumber: number, label: `الدرس ${toArabicDigits(number)}`, startPoint: `سورة الأنفال ${number}` });

function page(course: CourseDTO, extra: Partial<LessonProps> = {}) {
  return render(
    <Lesson course={course} live={quiet} otherLive={null} ticks={none()} now={MON_2110} listening={false} onTick={noop} onPlay={noop} onLive={noop} {...extra} />,
  );
}
const sections = () => screen.queryAllByRole('heading', { level: 2 }).map((h) => h.textContent);
const archive = () => [...document.querySelectorAll('.archive .lesson .b')].map((e) => e.textContent);

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
  vi.mocked(api.fetchLessons).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(api.fetchLessons).mockReset();
});

describe('Lesson page', () => {
  it('the title names the slot in Ruqaa', () => {
    const { container } = page(tafsir);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('درس الفجر');
    expect(container.querySelector('[data-slot]')!.getAttribute('data-slot')).toBe('fajr');
    cleanup();
    page(tawhid, { now: MON_0940 });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('درس العصر');
    expect(screen.getByText(tawhid.title)).toBeTruthy();
    expect(screen.getByText('مسجد قباء').className).toContain('place');
    expect(screen.getByText(/الثلاثاء/)).toBeTruthy();
    expect(document.querySelector('.lh .date')!.textContent).toBe('الاثنين٢٢ جمادى الأولى');
  });

  it('sections appear in the order الدرس القادم, آخر درس, كل الدروس', () => {
    page(tafsir);
    expect(sections()).toEqual(['الدرس القادم· حضّره', 'آخر درس· راجعه', 'كل الدروس']);
  });

  it('الدرس القادم shows the lesson, the day and time, the passage, the book and the read tick', () => {
    const onTick = vi.fn();
    page(tafsir, { onTick });
    expect(screen.getByText('غدًا بعد الفجر · ٥:٢٥ ص')).toBeTruthy();
    expect(screen.getByText('يتابع من حيث توقف الدرس ٤٤٣ · إلى نحو ص ٣١٤')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'اقرأ في الكتاب · ص ٣١٢' }).getAttribute('href')).toBe('#/book/kitab-tawhid/0/312?marker=1');
    fireEvent.click(screen.getByRole('button', { name: 'قرأتُه' }));
    expect(onTick).toHaveBeenCalledWith('read', 'kitab-tawhid', 444);
  });

  it('آخر درس plays the recording, opens the book at its start and carries the reviewed tick', () => {
    const onPlay = vi.fn();
    const onTick = vi.fn();
    const { container } = page(tafsir, { onPlay, onTick });
    const last = container.querySelector('.last')!;
    expect(last.textContent).toContain('الدرس ٤٤٣');
    fireEvent.click(last.querySelector('button.chip.pri')!);
    expect(onPlay.mock.calls[0][0].number).toBe(443);
    expect(screen.getByRole('link', { name: 'الكتاب · ص ٣١٠' }).getAttribute('href')).toBe('#/book/kitab-tawhid/0/310');
    fireEvent.click([...last.querySelectorAll('button')].find((b) => b.textContent === 'راجعتُه')!);
    expect(onTick).toHaveBeenCalledWith('reviewed', 'kitab-tawhid', 443);
  });

  it('كل الدروس omits the lesson shown in آخر درس', () => {
    page(tafsir);
    expect(archive()).toEqual(['الدرس ٤٤٢', 'الدرس ٤٤١']);
  });

  it('on air, the live hero replaces الدرس القادم and its listen button calls onLive', () => {
    const onLive = vi.fn();
    const { container } = page(TAWHID, { live: liveDTO('kabair'), now: new Date('2026-11-02T15:30:00Z'), onLive });
    expect(sections()).toEqual(['آخر درس· راجعه', 'كل الدروس']);
    expect(screen.getByText('مباشر الآن · درس العصر')).toBeTruthy();
    expect(container.querySelector('.disc.live.pulse')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'استمع إلى البث المباشر' }));
    expect(onLive).toHaveBeenCalledOnce();
    expect(container.querySelector('.lh')!.compareDocumentPosition(container.querySelector('.hero')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the live hero while already listening stops pulsing and says so', () => {
    const { container } = page(TAWHID, { live: liveDTO('kabair'), listening: true });
    expect(container.querySelector('.disc')!.classList.contains('pulse')).toBe(false);
    expect(screen.getByRole('button', { name: 'تستمع الآن إلى البث' })).toBeTruthy();
  });

  it('the other lesson on air shows a red card above the title that calls onLive', () => {
    const onLive = vi.fn();
    const { container } = page(tafsir, { live: liveDTO('kabair'), otherLive: { course: TAWHID }, onLive });
    const card = container.querySelector('.livecard')!;
    expect(card.textContent).toContain('درس العصر مباشر الآن');
    expect(card.compareDocumentPosition(container.querySelector('.lh')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(card.querySelector('button')!);
    expect(onLive).toHaveBeenCalledOnce();
    expect(sections()[0]).toBe('الدرس القادم· حضّره');
  });

  it('a broadcast of no lesson puts the live hero above the title and keeps الدرس القادم', () => {
    const { container } = page(tafsir, { live: liveDTO(null), otherLive: { course: null } });
    expect(screen.getByText('مباشر الآن')).toBeTruthy();
    expect(container.querySelector('.hero')!.compareDocumentPosition(container.querySelector('.lh')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sections()[0]).toBe('الدرس القادم· حضّره');
  });

  it('awaiting shows التسجيل قريبًا without a lesson label, and the previous recording leads كل الدروس', () => {
    page(tawhid);
    expect(screen.getByText('التسجيل قريبًا')).toBeTruthy();
    expect(screen.getByText('يُتاح التسجيل بعد نشره على موقع الشيخ')).toBeTruthy();
    expect(archive()).toEqual(['المجلس ٢', 'المجلس ١']);
  });

  it('درس اليوم after the start, then انتهى after 150 minutes', () => {
    page(tawhid, { now: MON_1900 });
    expect(sections()[0]).toBe('درس اليوم');
    expect(screen.getByText('بدأ ٦:٢٠ م')).toBeTruthy();
    cleanup();
    page(tawhid, { now: MON_2110 });
    expect(screen.getByText('انتهى')).toBeTruthy();
  });

  it('لا يوجد درس قادم مجدول without next', () => {
    page({ ...tafsir, next: null });
    expect(screen.getByText('لا يوجد درس قادم مجدول')).toBeTruthy();
  });

  it('a course with no lessons and no next lesson renders without crashing', () => {
    page({ ...tafsir, latest: [], next: null });
    expect(screen.getByText('لا يوجد درس قادم مجدول')).toBeTruthy();
    expect(sections()).toEqual([]);
  });

  it('shows the follow notice under the title', () => {
    page(tafsir, { notice: <p class="notice">إشعار</p> });
    expect(screen.getByText('إشعار')).toBeTruthy();
  });

  it('loads older lessons at the end of كل الدروس, with reviewed ticks', async () => {
    vi.mocked(api.fetchLessons).mockResolvedValue([lesson(440), lesson(439)]);
    const ticks: Ticks = { read: new Set(), reviewed: new Set(['kitab-tawhid:442']) };
    const { container } = page(tafsir, { ticks });
    expect([...container.querySelectorAll('.archive button[aria-label="راجعتُه"]')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    await act(async () => observer!.cb([{ isIntersecting: true }]));
    expect(api.fetchLessons).toHaveBeenCalledWith('kitab-tawhid', 441);
    await waitFor(() => expect(archive()).toEqual(['الدرس ٤٤٢', 'الدرس ٤٤١', 'الدرس ٤٤٠', 'الدرس ٤٣٩']));
  });

  it('unknown page: one button per volume at page 1 in the title block', () => {
    const blank = { ...tawhid, latest: tawhid.latest.map((l) => ({ ...l, startPage: null, endPage: null })), next: { ...tawhid.next!, startPage: null } };
    page(blank, { now: MON_0940 });
    expect(['الجزء ١', 'الجزء ٢', 'الجزء ٣'].map((n) => screen.getByRole('link', { name: n }).getAttribute('href'))).toEqual([
      '#/book/kabair/0/1',
      '#/book/kabair/1/1',
      '#/book/kabair/2/1',
    ]);
  });

  it('an unlinked book shows the next passage page in its edition', () => {
    page({ ...tafsir, pdfUrls: [], edition: 'طبعة دار ابن الجوزي' });
    expect(screen.getByText('ص ٣١٢ · طبعة دار ابن الجوزي')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /الكتاب/ })).toBeNull();
  });
});

describe('Kitab at-Tawhid page numbers (PDF page = printed page + 2)', () => {
  it('shows printed numbers for the next passage, the last lesson and the archive', () => {
    page(TAWHID, { now: MON_0940 });
    expect(screen.getByRole('link', { name: 'اقرأ في الكتاب · ص ٢٧٨' }).getAttribute('href')).toBe('#/book/kabair/0/280?marker=1');
    expect(screen.getByRole('link', { name: 'الكتاب · ص ٢٧٣' }).getAttribute('href')).toBe('#/book/kabair/0/275');
    expect(screen.getByText(/· ص ٢٦٨$/)).toBeTruthy();
  });

  it('Tafsir, with no offsets, keeps its edition page numbers', () => {
    page(TAFSIR, { now: MON_0940 });
    expect(screen.getByText('ص ٦٣٦ · طبعة دار ابن الجوزي')).toBeTruthy();
  });
});
