import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

const handlers = vi.hoisted(() => new Map<string, () => void>());
const session = vi.hoisted(() => ({
  setMetadata: vi.fn(async () => {}),
  setPlaybackState: vi.fn(async () => {}),
  setPositionState: vi.fn(async () => {}),
  setActionHandler: vi.fn(async ({ action }: { action: string }, cb: () => void) => void handlers.set(action, cb)),
}));
vi.mock('@capgo/capacitor-media-session', () => ({ MediaSession: session }));

class FakeAudio extends EventTarget {
  src = '';
  currentTime = 0;
  duration = NaN;
  paused = true;
  play = vi.fn(async () => {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  });
}
vi.stubGlobal('Audio', FakeAudio);

import type { CourseDTO } from '@albadr/shared';
import { player } from '../src/audio/player';
import { LiveSheet, type LiveSheetProps } from '../src/ui/LiveSheet';
import { TAFSIR, TAWHID } from './live-state';

const live = { isLive: true, mode: 'embed' as const, embedUrl: 'about:blank#mixlr', streamUrl: null, courseId: null, startedAt: null };
const noop = () => {};
const sheet = (p: Partial<LiveSheetProps> = {}) => (
  <LiveSheet live={live} course={undefined} startedAt={null} expanded onExpand={noop} onCollapse={noop} onClose={noop} {...p} />
);

beforeAll(() => {
  const { settings } = (window as unknown as { happyDOM: { settings: Record<string, boolean> } }).happyDOM;
  settings.disableIframePageLoading = false;
  settings.enableIframePageLoading = true;
});

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it('embeds the Mixlr page with autoplay', () => {
  const { container } = render(sheet());
  const frame = container.querySelector('iframe')!;
  expect(frame.getAttribute('src')).toBe(live.embedUrl);
  expect(frame.getAttribute('allow')).toBe('autoplay');
  expect(screen.queryByText('لمواصلة الاستماع أبقِ الشاشة مفتوحة')).toBeNull();
});

it('owns the media session while open and the notification pause closes it', () => {
  const onClose = vi.fn();
  const { rerender } = render(<div>{sheet({ course: TAFSIR, onClose })}</div>);
  expect(session.setMetadata).toHaveBeenCalledWith(expect.objectContaining({ title: 'شرح تفسير السعدي', artist: 'الشيخ عبد الرزاق البدر' }));
  expect(session.setPlaybackState).toHaveBeenLastCalledWith({ playbackState: 'playing' });

  handlers.get('pause')!();
  expect(onClose).toHaveBeenCalled();

  rerender(<div />);
  expect(session.setPlaybackState).toHaveBeenLastCalledWith({ playbackState: 'none' });
});

it('hands the session back to recordings after the sheet closes', async () => {
  const onClose = vi.fn();
  render(<div>{sheet({ onClose })}</div>).rerender(<div />);
  await player.play({ url: 'https://x/a.mp3', title: 'الدرس ٣', subtitle: '', kind: 'recording' });
  expect(player.state.playing).toBe(true);
  handlers.get('pause')!();
  expect(player.state.playing).toBe(false);
  expect(onClose).not.toHaveBeenCalled();
  expect(session.setPlaybackState).toHaveBeenLastCalledWith({ playbackState: 'paused' });
});

it('Tafsir: names the lesson and shows where it starts with the printed page and edition, without a book button', () => {
  render(sheet({ course: TAFSIR }));
  expect(screen.getByText('شرح تفسير السعدي')).toBeTruthy();
  expect(screen.getByText('البث المباشر · الدرس ٤٦٠')).toBeTruthy();
  expect(screen.getByText('تفسير سورة التوبة: من الآية (٨) ﴿كَيْفَ وَإِنْ يَظْهَرُوا عَلَيْكُمْ لَا يَرْقُبُوا فِيكُمْ إِلًّا وَلَا ذِمَّةً...﴾')).toBeTruthy();
  expect(screen.getByText('ص ٦٣٦ · طبعة دار ابن الجوزي')).toBeTruthy();
  expect(screen.queryByRole('link')).toBeNull();
});

it('evening course: shows where the lesson starts and opens the book there, collapsing the sheet', () => {
  const onCollapse = vi.fn();
  render(sheet({ course: TAWHID, onCollapse }));
  expect(screen.getByText('البث المباشر · الدرس ١٥')).toBeTruthy();
  expect(screen.getByText('من قوله: <فيه مسائل: الأولى: الخوف من الشرك>…')).toBeTruthy();
  const link = screen.getByRole('link', { name: 'تابع في الكتاب · ص ٢٧٨' });
  expect(link.getAttribute('href')).toBe('#/book/kitab-tawhid/0/280?marker=1');
  fireEvent.click(link);
  expect(onCollapse).toHaveBeenCalled();
});

it('falls back when the start text, the page or the next lesson is unknown', () => {
  const noStart: CourseDTO = { ...TAWHID, next: { ...TAWHID.next!, startPoint: null, startPage: null } };
  const { rerender } = render(sheet({ course: noStart }));
  expect(screen.getByText('يتابع من حيث توقف الدرس ١٤')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'تابع في الكتاب' }).getAttribute('href')).toBe('#/book/kitab-tawhid/0/1');

  rerender(sheet({ course: { ...TAFSIR, next: null } }));
  expect(screen.getByText('البث المباشر · الدرس ٤٤٤')).toBeTruthy();
  expect(screen.queryByText('يبدأ الدرس من')).toBeNull();

  rerender(sheet({ course: undefined }));
  expect(screen.getAllByText('البث المباشر').length).toBeGreaterThan(0);
  expect(screen.queryByText('يبدأ الدرس من')).toBeNull();
});

it('collapses into a bar with the course, lesson and book link while keeping the same iframe', () => {
  const onExpand = vi.fn();
  const onClose = vi.fn();
  const { container, rerender } = render(sheet({ course: TAWHID, onExpand, onClose }));
  const frame = container.querySelector('iframe')!;
  rerender(sheet({ course: TAWHID, onExpand, onClose, expanded: false }));
  expect(container.querySelector('iframe')).toBe(frame);
  expect(container.querySelector('.sheet.min')).toBeTruthy();
  expect(screen.getByText('مباشر · الدرس ١٥')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'تابع في الكتاب · ص ٢٧٨' }).textContent).toBe('تابع في الكتاب');
  fireEvent.click(screen.getByRole('button', { name: /مباشر · الدرس ١٥/ }));
  expect(onExpand).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'إيقاف البث' }));
  expect(onClose).toHaveBeenCalled();
});

it('the Tafsir bar shows the printed page instead of a book link', () => {
  render(sheet({ course: TAFSIR, expanded: false }));
  expect(screen.getByText(/مباشر · الدرس ٤٦٠ · ص ٦٣٦ · طبعة دار ابن الجوزي/)).toBeTruthy();
  expect(screen.queryByRole('link')).toBeNull();
});

it('the bar stops claiming live once the broadcast has ended, without cutting the player', () => {
  const { container, rerender } = render(sheet({ course: TAWHID, expanded: false }));
  const frame = container.querySelector('iframe')!;
  rerender(sheet({ course: TAWHID, expanded: false, live: { ...live, isLive: false } }));
  expect(screen.getByText('انتهى البث')).toBeTruthy();
  expect(screen.queryByText(/مباشر · الدرس/)).toBeNull();
  expect(container.querySelector('.lbar .dot')).toBeNull();
  expect(container.querySelector('iframe')).toBe(frame);
});

it('reads the title and «يبدأ الدرس من» before the player, in the same two elements whatever the state', () => {
  const { container, rerender } = render(sheet({ course: TAWHID }));
  const root = container.querySelector('.sheet')!;
  const [head, frame] = [...root.children];
  expect(head.className).toBe('lhead');
  expect(frame.tagName).toBe('IFRAME');
  expect(head.textContent).toContain('يبدأ الدرس من');
  rerender(sheet({ course: TAWHID, expanded: false }));
  expect([...root.children]).toEqual([head, frame]);
  expect(head.className).toBe('lbar');
});

it('the expanded sheet can stop the broadcast too', () => {
  const onClose = vi.fn();
  render(sheet({ course: TAWHID, onClose }));
  fireEvent.click(screen.getByRole('button', { name: 'إيقاف البث' }));
  expect(onClose).toHaveBeenCalled();
});

it('the bar button is named by the course and lesson, and the status is announced politely', () => {
  const { container } = render(sheet({ course: TAWHID, expanded: false }));
  const button = screen.getByRole('button', { name: /التعليق على شرح كتاب التوحيد.*مباشر · الدرس ١٥/ });
  expect(button.getAttribute('aria-label')).toBeNull();
  expect(container.querySelector('.lbar .m')!.getAttribute('aria-live')).toBe('polite');
});

it('reloads a stuck Mixlr page in place, without closing the broadcast or its media session', () => {
  const onClose = vi.fn();
  const { container, rerender } = render(sheet({ course: TAWHID, onClose }));
  const root = container.querySelector('.sheet')!;
  const [head, frame] = [...root.children];
  vi.clearAllMocks();

  fireEvent.click(screen.getByRole('button', { name: 'إعادة تحميل البث' }));

  const reloaded = container.querySelector('iframe')!;
  expect(reloaded).not.toBe(frame);
  expect(reloaded.getAttribute('src')).toBe(live.embedUrl);
  expect(reloaded.getAttribute('allow')).toBe('autoplay');
  expect(frame.isConnected).toBe(false);
  expect(root.children.length).toBe(2);
  expect(root.children[0]).toBe(head);
  expect(root.children[1]).toBe(reloaded);
  expect(onClose).not.toHaveBeenCalled();
  expect(session.setMetadata).not.toHaveBeenCalled();
  expect(session.setPlaybackState).not.toHaveBeenCalled();

  rerender(sheet({ course: TAWHID, onClose, expanded: false }));
  rerender(sheet({ course: TAWHID, onClose }));
  expect(container.querySelector('iframe')).toBe(reloaded);
});

it('offers the reload even when the lesson start is unknown', () => {
  render(sheet({ course: undefined }));
  expect(screen.getByRole('button', { name: 'إعادة تحميل البث' })).toBeTruthy();
});
