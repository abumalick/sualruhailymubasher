import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
import { clearLive, currentData, refresh, requestLive } from '../src/store';
import { seedPrefs } from './seed';
import { tapNavigation } from '../src/logic/topics';
import { navigate, parseRoute, replaceRoute } from '../src/router';

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
  seedPrefs(prefs, liveState(null).courses);
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
  const frame = await openLive('kabair');
  const sheetEl = screen.getByRole('dialog', { name: 'البث المباشر' });
  const head = sheetEl.firstElementChild!;
  expect([...sheetEl.children]).toEqual([head, frame]);
  const w = watch(frame, head);

  fireEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'تابع في الكتاب · ص ٢٧٨' }));
  await go('#/book/kabair/0/280?marker=1');
  expect(screen.getByText('book page 280')).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('region', { name: 'البث المباشر' })).toBeTruthy();
  expect(screen.getByText('بث مباشر')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'تابع في الكتاب · ص ٢٧٨' })).toBeNull();
  expect(screen.getByTitle('البث المباشر')).toBe(frame);

  await go('#/more');
  await go('#/');
  fireEvent.click(screen.getByRole('button', { name: /بث مباشر/ }));
  expect(screen.getByRole('dialog', { name: 'البث المباشر' })).toBeTruthy();

  w.flush();
  w.stop();
  expect(w.moves).toEqual([]);
  expect([...sheetEl.children]).toEqual([head, frame]);
  expect(frame.isConnected).toBe(true);
  expect(session.setPlaybackState).not.toHaveBeenCalledWith({ playbackState: 'none' });
});

it("the book's back arrow falls back to the lesson's tab, which holds the live hero", async () => {
  await openLive('kabair');
  await go('#/book/kabair/0/280?marker=1');
  expect(document.querySelector('.book')!.getAttribute('data-back')).toBe('#/course/kabair');
  await go('#/book/kitab-tawhid/0/12');
  expect(document.querySelector('.book')!.getAttribute('data-back')).toBe('#/course/kitab-tawhid');
  fireEvent.click(screen.getByRole('button', { name: 'إيقاف البث' }));
  await go('#/book/kabair/0/280');
  expect(document.querySelector('.book')!.getAttribute('data-back')).toBe('#/course/kabair');
});

it("Android's back button shrinks the open live player without reloading Mixlr or leaving the page", async () => {
  const frame = await openLive('kabair');
  const back = vi.spyOn(history, 'back').mockImplementation(() => {});
  act(() => backButton.press!(true));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('region', { name: 'البث المباشر' })).toBeTruthy();
  expect(screen.getByTitle('البث المباشر')).toBe(frame);
  expect(location.hash).toBe('#/course/kabair');
  expect(back).not.toHaveBeenCalled();

  act(() => backButton.press!(true));
  expect(back).toHaveBeenCalledOnce();
  back.mockRestore();
});

it('tapping the hero again after collapsing re-expands the same sheet without reloading Mixlr', async () => {
  const frame = await openLive('kabair');
  fireEvent.click(screen.getByRole('button', { name: 'تصغير' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'تستمع الآن إلى البث' }));
  expect(screen.getByRole('dialog', { name: 'البث المباشر' })).toBeTruthy();
  expect(screen.getByTitle('البث المباشر')).toBe(frame);
});

it('a deep link to the book while the sheet is open collapses it instead of covering the book', async () => {
  const frame = await openLive('kitab-tawhid');
  await go('#/book/kabair/0/12');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByText('book page 12')).toBeTruthy();
  expect(screen.getByTitle('البث المباشر')).toBe(frame);
});

it('stopping from the bar removes the player and clears the media session', async () => {
  await openLive('kabair');
  await go('#/more');
  fireEvent.click(screen.getByRole('button', { name: 'إيقاف البث' }));
  expect(screen.queryByTitle('البث المباشر')).toBeNull();
  expect(session.setPlaybackState).toHaveBeenLastCalledWith({ playbackState: 'none' });
});

it('playing a recording while the bar is up stops the live player first and keeps the recording session', async () => {
  await openLive('kabair');
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  vi.mocked(api.fetchLessons).mockResolvedValue([]);
  await go('#/course/kabair');
  fireEvent.click(screen.getAllByRole('button', { name: 'استمع' })[0]);
  await act(async () => {});
  expect(screen.queryByTitle('البث المباشر')).toBeNull();
  expect(player.state.src?.kind).toBe('recording');
  expect(player.state.src?.title).toBe('شرح كتاب الكبائر للذهبي · المجلس ١٤');
  expect(session.setPlaybackState).toHaveBeenLastCalledWith({ playbackState: 'playing' });
});

it('when the server reports the end with no course, the bar keeps its lesson and book link and says it ended', async () => {
  const frame = await openLive('kabair');
  await go('#/more');
  vi.mocked(api.fetchState).mockResolvedValue({ state: endedState(), fresh: true });
  await act(() => refresh());
  expect(screen.queryByText('مباشر الآن')).toBeNull();
  expect(screen.getByText('انتهى البث')).toBeTruthy();
  expect(screen.getByRole('button', { name: /شرح كتاب الكبائر للذهبي.*انتهى البث/ })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'تابع في الكتاب · ص ٢٧٨' }).getAttribute('href')).toBe('#/book/kabair/0/280?marker=1');
  expect(screen.getByTitle('البث المباشر')).toBe(frame);
});

it('tapping the hero again in direct mode keeps the stream instead of reloading it', async () => {
  vi.mocked(api.loadCachedState).mockResolvedValue({ ...liveState('kabair'), live: { ...liveState('kabair').live, mode: 'direct', streamUrl: 'https://s/live' } });
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'استمع إلى البث المباشر' }));
  await act(async () => {});
  const src = player.state.src;
  fireEvent.click(await screen.findByRole('button', { name: 'تستمع الآن إلى البث' }));
  await act(async () => {});
  expect(player.state.src).toBe(src);
});

describe('the live notification', () => {
  const quiet = () => ({ ...endedState(), live: { ...endedState().live, embedUrl: 'about:blank#mixlr' } });
  let answer: (state: ReturnType<typeof liveState>) => void = () => {};
  const pendingFetch = () => vi.mocked(api.fetchState).mockImplementation(() => new Promise((r) => (answer = (state) => r({ state, fresh: true }))));
  const tap = (courseId: string | null, hash?: string) =>
    act(() => {
      requestLive({ courseId });
      if (hash) {
        location.hash = hash;
        dispatchEvent(new HashChangeEvent('hashchange'));
      }
    });
  afterEach(() => act(() => clearLive()));

  it('tapping it opens that lesson with the player expanded', async () => {
    location.hash = '#/more';
    vi.mocked(api.loadCachedState).mockResolvedValue(quiet());
    render(<App />);
    await screen.findByText('روابط');
    pendingFetch();
    await tap('kabair', '#/course/kabair');
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => answer(liveState('kabair')));
    expect(await screen.findByRole('dialog', { name: 'البث المباشر' })).toBeTruthy();
    expect(location.hash).toBe('#/course/kabair');
  });

  it('a cold start waits for the fresh state before opening', async () => {
    pendingFetch();
    vi.mocked(api.loadCachedState).mockResolvedValue(quiet());
    requestLive({ courseId: 'kabair' });
    location.hash = '#/course/kabair';
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'درس العصر' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => answer(liveState('kabair')));
    expect(await screen.findByRole('dialog', { name: 'البث المباشر' })).toBeTruthy();
  });

  it('a stale notification lands on the tab without a player', async () => {
    location.hash = '#/more';
    vi.mocked(api.loadCachedState).mockResolvedValue(quiet());
    render(<App />);
    await screen.findByText('روابط');
    // Let the boot's own fetch settle, so the tap's fetch is the one answered below.
    await act(() => refresh());
    pendingFetch();
    await tap('kabair', '#/course/kabair');
    await act(async () => answer(quiet()));
    await screen.findByRole('heading', { level: 1, name: 'درس العصر' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('region', { name: 'البث المباشر' })).toBeNull();
  });

  it('a tap for a lesson that is no longer listed opens no player', async () => {
    const fajrOnly = <T extends { courses: { id: string }[] }>(s: T): T => ({ ...s, courses: s.courses.filter((c) => c.id === 'kitab-tawhid') });
    location.hash = '#/course/kitab-tawhid';
    vi.mocked(api.loadCachedState).mockResolvedValue(fajrOnly(quiet()));
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'درس الفجر' });
    pendingFetch();
    await tap('kabair');
    await act(async () => answer(fajrOnly(liveState('kabair'))));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(currentData().intent).toBeNull();
  });

  it('a listener who leaves the tab before the fresh state never gets a player later', async () => {
    location.hash = '#/more';
    vi.mocked(api.loadCachedState).mockResolvedValue(quiet());
    render(<App />);
    await screen.findByText('روابط');
    pendingFetch();
    await tap('kabair', '#/course/kabair');
    await go('#/course/kitab-tawhid');
    await act(async () => answer(liveState('kabair')));
    await go('#/course/kabair');
    await screen.findByRole('heading', { level: 1, name: 'درس العصر' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(currentData().intent).toBeNull();
  });

  it('a live-other tap on a cold start keeps the player expanded after the app picks its tab', async () => {
    pendingFetch();
    vi.mocked(api.loadCachedState).mockResolvedValue(null);
    requestLive({ courseId: null });
    location.hash = '#/';
    render(<App />);
    await act(async () => answer(liveState(null)));
    await waitFor(() => expect(location.hash).toMatch(/^#\/course\//));
    expect(await screen.findByRole('dialog', { name: 'البث المباشر' })).toBeTruthy();
  });

  it('a live-other tap during the tour replay closes the tour and shows the player', async () => {
    location.hash = '#/welcome';
    vi.mocked(api.loadCachedState).mockResolvedValue(quiet());
    render(<App />);
    await screen.findByRole('heading', { name: 'أيَّ الدروس تحضر؟' });
    pendingFetch();
    // The push handler's own lines (asking for the player, applying the route) are covered by push.test.tsx.
    await act(() => {
      requestLive({ courseId: null });
      const to = tapNavigation({ kind: 'live-other', number: '' }, currentData().state, parseRoute(location.hash).name === 'welcome');
      if (to) (to.replace ? replaceRoute : navigate)(to.path);
      dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await act(async () => answer(liveState(null)));
    expect(await screen.findByRole('dialog', { name: 'البث المباشر' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'أيَّ الدروس تحضر؟' })).toBeNull();
  });

  it('a live-other tap opens the player and keeps the current tab', async () => {
    location.hash = '#/course/kitab-tawhid';
    vi.mocked(api.loadCachedState).mockResolvedValue(quiet());
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'درس الفجر' });
    pendingFetch();
    await tap(null);
    await act(async () => answer(liveState(null)));
    expect(await screen.findByRole('dialog', { name: 'البث المباشر' })).toBeTruthy();
    expect(location.hash).toBe('#/course/kitab-tawhid');
  });
});
