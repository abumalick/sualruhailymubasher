import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

const prefs = vi.hoisted(() => new Map<string, string>());
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: prefs.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => void prefs.set(key, value),
    remove: async ({ key }: { key: string }) => void prefs.delete(key),
    keys: async () => ({ keys: [] }),
  },
}));
const backButton = vi.hoisted(() => ({ press: null as ((canGoBack: boolean) => void) | null }));
vi.mock('../src/backButton', () => ({
  onBackButton: (handler: (canGoBack: boolean) => void) => {
    backButton.press = handler;
    return () => {
      backButton.press = null;
    };
  },
}));
vi.mock('../src/api', () => ({ loadCachedState: vi.fn(), fetchState: vi.fn(), fetchLessons: vi.fn() }));
vi.mock('../src/ui/Book', () => ({
  Book: ({ page, back }: { page: number; back: string }) => (
    <div class="book" data-back={back}>
      book page {page}
    </div>
  ),
}));
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
import { endedState, liveState } from './live-state';
import { refresh } from '../src/store';
import { followOnly } from '../src/logic/follow';

const go = (hash: string) =>
  act(() => {
    location.hash = hash;
    dispatchEvent(new HashChangeEvent('hashchange'));
  });

// Records every time a watched node leaves or enters the DOM. For the iframe either one reloads Mixlr and stops the
// audio; for the header it would mean the reading order changed around the player.
function watch(...watched: Element[]) {
  const moves: string[] = [];
  const touches = (nodes: NodeList) => [...nodes].some((n) => watched.some((w) => n === w || n.contains(w)));
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
  prefs.clear();
  prefs.set('follow', JSON.stringify(followOnly(liveState(null).courses, ['tafsir-saadi', 'kitab-tawhid'])));
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
  fireEvent.click(await screen.findByRole('button', { name: 'استمع إلى البث المباشر' }));
  return screen.getByTitle('البث المباشر') as HTMLIFrameElement;
}

it('opening the book from the live sheet keeps the Mixlr iframe mounted and collapses it into a bar', async () => {
  const frame = await openLive('kitab-tawhid');
  const sheetEl = screen.getByRole('dialog', { name: 'البث المباشر' });
  const head = sheetEl.firstElementChild!;
  expect([...sheetEl.children]).toEqual([head, frame]);
  const w = watch(frame, head);

  fireEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'تابع في الكتاب · ص ٢٧٨' }));
  await go('#/book/kitab-tawhid/0/280?marker=1');
  expect(screen.getByText('book page 280')).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('region', { name: 'البث المباشر' })).toBeTruthy();
  expect(screen.getByText('مباشر · الدرس ١٥')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'تابع في الكتاب · ص ٢٧٨' })).toBeNull();
  expect(screen.getByTitle('البث المباشر')).toBe(frame);

  await go('#/courses');
  await go('#/');
  fireEvent.click(screen.getByRole('button', { name: /مباشر · الدرس ١٥/ }));
  expect(screen.getByRole('dialog', { name: 'البث المباشر' })).toBeTruthy();

  w.flush();
  w.stop();
  expect(w.moves).toEqual([]);
  expect([...sheetEl.children]).toEqual([head, frame]);
  expect(frame.isConnected).toBe(true);
  expect(session.setPlaybackState).not.toHaveBeenCalledWith({ playbackState: 'none' });
});

it("the book's back arrow falls back to the lesson's tab, which holds the live hero", async () => {
  await openLive('kitab-tawhid');
  await go('#/book/kitab-tawhid/0/280?marker=1');
  expect(document.querySelector('.book')!.getAttribute('data-back')).toBe('#/course/kitab-tawhid');
  await go('#/book/tafsir-saadi/0/12');
  expect(document.querySelector('.book')!.getAttribute('data-back')).toBe('#/course/tafsir-saadi');
  fireEvent.click(screen.getByRole('button', { name: 'إيقاف البث' }));
  await go('#/book/kitab-tawhid/0/280');
  expect(document.querySelector('.book')!.getAttribute('data-back')).toBe('#/course/kitab-tawhid');
});

it("Android's back button shrinks the open live player without reloading Mixlr or leaving the page", async () => {
  const frame = await openLive('kitab-tawhid');
  const back = vi.spyOn(history, 'back').mockImplementation(() => {});
  act(() => backButton.press!(true));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('region', { name: 'البث المباشر' })).toBeTruthy();
  expect(screen.getByTitle('البث المباشر')).toBe(frame);
  expect(location.hash).toBe('#/course/kitab-tawhid');
  expect(back).not.toHaveBeenCalled();

  act(() => backButton.press!(true));
  expect(back).toHaveBeenCalledOnce();
  back.mockRestore();
});

it('tapping the hero again after collapsing re-expands the same sheet without reloading Mixlr', async () => {
  const frame = await openLive('kitab-tawhid');
  fireEvent.click(screen.getByRole('button', { name: 'تصغير' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'تستمع الآن إلى البث' }));
  expect(screen.getByRole('dialog', { name: 'البث المباشر' })).toBeTruthy();
  expect(screen.getByTitle('البث المباشر')).toBe(frame);
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

it('when the server reports the end with no course, the bar keeps its lesson and book link and says it ended', async () => {
  const frame = await openLive('kitab-tawhid');
  await go('#/courses');
  vi.mocked(api.fetchState).mockResolvedValue({ state: endedState(), fresh: true });
  await act(() => refresh());
  expect(screen.queryByText('مباشر الآن')).toBeNull();
  expect(screen.getByText('انتهى البث')).toBeTruthy();
  expect(screen.getByRole('button', { name: /التعليق على شرح كتاب التوحيد.*انتهى البث/ })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'تابع في الكتاب · ص ٢٧٨' }).getAttribute('href')).toBe('#/book/kitab-tawhid/0/280?marker=1');
  expect(screen.getByTitle('البث المباشر')).toBe(frame);
});

it('dropping the course on air closes the root-mounted live player and clears the media session', async () => {
  await openLive('kitab-tawhid');
  await go('#/follow');
  expect(screen.getByTitle('البث المباشر')).toBeTruthy();
  fireEvent.click(await screen.findByRole('checkbox', { name: /درس المغرب/ }));
  fireEvent.click(screen.getByRole('button', { name: 'حفظ · درس الفجر فقط' }));
  await screen.findByText('دروسك: درس الفجر فقط');
  expect(screen.queryByTitle('البث المباشر')).toBeNull();
  expect(screen.queryByRole('region', { name: 'البث المباشر' })).toBeNull();
  expect(session.setPlaybackState).toHaveBeenLastCalledWith({ playbackState: 'none' });
});

it('dropping another course leaves the live player alone', async () => {
  const frame = await openLive('kitab-tawhid');
  await go('#/follow');
  fireEvent.click(await screen.findByRole('checkbox', { name: /درس الفجر/ }));
  fireEvent.click(screen.getByRole('button', { name: 'حفظ · درس المغرب فقط' }));
  await screen.findByText('دروسك: درس المغرب فقط');
  expect(screen.getByTitle('البث المباشر')).toBe(frame);
});

it('dropping the course of a direct stream stops the audio', async () => {
  vi.mocked(api.loadCachedState).mockResolvedValue({ ...liveState('kitab-tawhid'), live: { ...liveState('kitab-tawhid').live, mode: 'direct', streamUrl: 'https://s/live' } });
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'استمع إلى البث المباشر' }));
  await act(async () => {});
  expect(player.state.src?.courseId).toBe('kitab-tawhid');
  await go('#/follow');
  fireEvent.click(await screen.findByRole('checkbox', { name: /درس المغرب/ }));
  fireEvent.click(screen.getByRole('button', { name: 'حفظ · درس الفجر فقط' }));
  await screen.findByText('دروسك: درس الفجر فقط');
  expect(player.state.src).toBeNull();
});

it('tapping the hero again in direct mode keeps the stream instead of reloading it', async () => {
  vi.mocked(api.loadCachedState).mockResolvedValue({ ...liveState('kitab-tawhid'), live: { ...liveState('kitab-tawhid').live, mode: 'direct', streamUrl: 'https://s/live' } });
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'استمع إلى البث المباشر' }));
  await act(async () => {});
  const src = player.state.src;
  fireEvent.click(await screen.findByRole('button', { name: 'تستمع الآن إلى البث' }));
  await act(async () => {});
  expect(player.state.src).toBe(src);
});
