import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@capacitor/preferences', () => ({
  Preferences: { get: async () => ({ value: null }), set: async () => {}, remove: async () => {}, keys: async () => ({ keys: [] }) },
}));
vi.mock('../src/api', () => ({ loadCachedState: vi.fn(), fetchState: vi.fn(), fetchLessons: vi.fn() }));
vi.mock('../src/ui/Book', () => ({ Book: ({ page }: { page: number }) => <div class="book">book page {page}</div> }));
const session = vi.hoisted(() => ({
  setMetadata: vi.fn(async () => {}),
  setPlaybackState: vi.fn(async () => {}),
  setPositionState: vi.fn(async () => {}),
  setActionHandler: vi.fn(async () => {}),
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

import * as api from '../src/api';
import { App } from '../src/App';
import { player } from '../src/audio/player';
import { liveState } from './live-state';

const go = (hash: string) =>
  act(() => {
    location.hash = hash;
    dispatchEvent(new HashChangeEvent('hashchange'));
  });

// Records every time the iframe leaves or enters the DOM: either one reloads Mixlr and stops the audio.
function watch(frame: HTMLIFrameElement) {
  const moves: string[] = [];
  const touches = (nodes: NodeList) => [...nodes].some((n) => n === frame || n.contains(frame));
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      if (touches(r.removedNodes)) moves.push('removed');
      if (touches(r.addedNodes)) moves.push('added');
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
  return { moves, flush: () => moves.push(...mo.takeRecords().flatMap((r) => [...(touches(r.removedNodes) ? ['removed'] : []), ...(touches(r.addedNodes) ? ['added'] : [])])), stop: () => mo.disconnect() };
}

beforeAll(() => {
  const { settings } = (window as unknown as { happyDOM: { settings: Record<string, boolean> } }).happyDOM;
  settings.disableIframePageLoading = false;
  settings.enableIframePageLoading = true;
});

beforeEach(async () => {
  vi.clearAllMocks();
  location.hash = '#/';
  vi.mocked(api.fetchState).mockRejectedValue(new Error('offline'));
});
afterEach(() => {
  player.endEmbed();
  cleanup();
  vi.unstubAllGlobals();
  vi.stubGlobal('Audio', FakeAudio);
});

async function openLive(courseId: string) {
  vi.mocked(api.loadCachedState).mockResolvedValue(liveState(courseId));
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'استمع إلى البث' }));
  return screen.getByTitle('البث المباشر') as HTMLIFrameElement;
}

it('opening the book from the live sheet keeps the Mixlr iframe mounted and collapses it into a bar', async () => {
  const frame = await openLive('kitab-tawhid');
  expect(screen.getByRole('dialog', { name: 'البث المباشر' })).toBeTruthy();
  const w = watch(frame);

  fireEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'تابع في الكتاب · ص ٢٨٠' }));
  await go('#/book/kitab-tawhid/0/280?marker=1');
  expect(screen.getByText('book page 280')).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('region', { name: 'البث المباشر' })).toBeTruthy();
  expect(screen.getByText('مباشر · الدرس ١٥')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'تابع في الكتاب · ص ٢٨٠' })).toBeNull();
  expect(screen.getByTitle('البث المباشر')).toBe(frame);

  await go('#/courses');
  await go('#/');
  fireEvent.click(screen.getByRole('button', { name: 'عرض البث المباشر' }));
  expect(screen.getByRole('dialog', { name: 'البث المباشر' })).toBeTruthy();

  w.flush();
  w.stop();
  expect(w.moves).toEqual([]);
  expect(frame.isConnected).toBe(true);
  expect(session.setPlaybackState).not.toHaveBeenCalledWith({ playbackState: 'none' });
});

it('a deep link to the book while the sheet is open collapses it instead of covering the book', async () => {
  const frame = await openLive('tafsir-saadi');
  await go('#/book/kitab-tawhid/0/12');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByText('book page 12')).toBeTruthy();
  expect(screen.getByTitle('البث المباشر')).toBe(frame);
});

it('stopping from the bar removes the player and clears the media session', async () => {
  await openLive('kitab-tawhid');
  await go('#/courses');
  fireEvent.click(screen.getByRole('button', { name: 'إيقاف البث' }));
  expect(screen.queryByTitle('البث المباشر')).toBeNull();
  expect(session.setPlaybackState).toHaveBeenLastCalledWith({ playbackState: 'none' });
});

it('playing a recording while the bar is up stops the live player first and keeps the recording session', async () => {
  await openLive('kitab-tawhid');
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  vi.mocked(api.fetchLessons).mockResolvedValue([]);
  await go('#/course/kitab-tawhid');
  fireEvent.click(screen.getAllByRole('button', { name: 'استمع' })[0]);
  await act(async () => {});
  expect(screen.queryByTitle('البث المباشر')).toBeNull();
  expect(player.state.src?.kind).toBe('recording');
  expect(session.setPlaybackState).toHaveBeenLastCalledWith({ playbackState: 'playing' });
});
