import { cleanup, render, screen } from '@testing-library/preact';
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

import { player } from '../src/audio/player';
import { LiveSheet } from '../src/ui/LiveSheet';

const live = { isLive: true, mode: 'embed' as const, embedUrl: 'about:blank#mixlr', streamUrl: null, courseId: null, startedAt: null };

beforeAll(() => {
  const { settings } = (window as unknown as { happyDOM: { settings: Record<string, boolean> } }).happyDOM;
  settings.disableIframePageLoading = false;
  settings.enableIframePageLoading = true;
});

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it('embeds the Mixlr page with autoplay', () => {
  const { container } = render(<LiveSheet live={live} title="البث المباشر" onClose={() => {}} />);
  const frame = container.querySelector('iframe')!;
  expect(frame.getAttribute('src')).toBe(live.embedUrl);
  expect(frame.getAttribute('allow')).toBe('autoplay');
  expect(screen.queryByText('لمواصلة الاستماع أبقِ الشاشة مفتوحة')).toBeNull();
});

it('owns the media session while open and the notification pause closes it', () => {
  const onClose = vi.fn();
  const { rerender } = render(<div><LiveSheet live={live} title="شرح تفسير السعدي" onClose={onClose} /></div>);
  expect(session.setMetadata).toHaveBeenCalledWith(expect.objectContaining({ title: 'شرح تفسير السعدي', artist: 'الشيخ عبد الرزاق البدر' }));
  expect(session.setPlaybackState).toHaveBeenLastCalledWith({ playbackState: 'playing' });

  handlers.get('pause')!();
  expect(onClose).toHaveBeenCalled();

  rerender(<div />);
  expect(session.setPlaybackState).toHaveBeenLastCalledWith({ playbackState: 'none' });
});

it('hands the session back to recordings after the sheet closes', async () => {
  const onClose = vi.fn();
  render(<div><LiveSheet live={live} title="البث المباشر" onClose={onClose} /></div>).rerender(<div />);
  await player.play({ url: 'https://x/a.mp3', title: 'الدرس ٣', subtitle: '', kind: 'recording' });
  expect(player.state.playing).toBe(true);
  handlers.get('pause')!();
  expect(player.state.playing).toBe(false);
  expect(onClose).not.toHaveBeenCalled();
  expect(session.setPlaybackState).toHaveBeenLastCalledWith({ playbackState: 'paused' });
});
