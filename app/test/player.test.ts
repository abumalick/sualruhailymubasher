import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  setMetadata: vi.fn(async () => {}),
  setPlaybackState: vi.fn(async () => {}),
  setPositionState: vi.fn(async () => {}),
  setActionHandler: vi.fn(async () => {}),
}));
vi.mock('@capgo/capacitor-media-session', () => ({ MediaSession: session }));

class FakeAudio extends EventTarget {
  static last: FakeAudio;
  static hangNext: Promise<void> | null = null;
  src = '';
  currentTime = 0;
  duration = NaN;
  paused = true;
  log: string[] = [];
  constructor() {
    super();
    FakeAudio.last = this;
  }
  play = vi.fn(async () => {
    if (FakeAudio.hangNext) {
      const h = FakeAudio.hangNext;
      FakeAudio.hangNext = null;
      return h;
    }
    this.paused = false;
    this.log.push('play');
    this.dispatchEvent(new Event('play'));
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.log.push('pause');
    this.dispatchEvent(new Event('pause'));
  });
}

const rec = { url: 'https://x/a.mp3', title: 'الدرس ٣', subtitle: 'الأصول', kind: 'recording' as const };
const live = { url: 'https://x/live', title: 'مباشر', subtitle: '', kind: 'live' as const };

async function load() {
  vi.resetModules();
  vi.stubGlobal('Audio', FakeAudio);
  return (await import('../src/audio/player')).player;
}

beforeEach(() => vi.clearAllMocks());

describe('player', () => {
  it('playing a recording sets media session metadata and playing state', async () => {
    const player = await load();
    const states: boolean[] = [];
    player.onChange((s) => states.push(s.playing));
    await player.play(rec);
    expect(session.setMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'الدرس ٣', artist: 'الشيخ عبد الرزاق البدر', artwork: [expect.objectContaining({ type: 'image/png' })] }),
    );
    expect(session.setPlaybackState).toHaveBeenCalledWith({ playbackState: 'playing' });
    expect(states.at(-1)).toBe(true);
    expect(FakeAudio.last.src).toBe(rec.url);
  });

  it('rejects seek on a live source', async () => {
    const player = await load();
    await player.play(live);
    expect(() => player.seek(10)).toThrow();
  });

  it('seeks a recording', async () => {
    const player = await load();
    await player.play(rec);
    player.seek(42);
    expect(FakeAudio.last.currentTime).toBe(42);
  });

  it('switching source pauses the previous one first', async () => {
    const player = await load();
    await player.play(rec);
    await player.play({ ...rec, url: 'https://x/b.mp3' });
    expect(FakeAudio.last.log).toEqual(['play', 'pause', 'play']);
    expect(FakeAudio.last.src).toBe('https://x/b.mp3');
  });

  it('surfaces an audio error', async () => {
    const player = await load();
    let last = null as string | null;
    player.onChange((s) => (last = s.error));
    await player.play(rec);
    FakeAudio.last.dispatchEvent(new Event('error'));
    expect(last).toBeTruthy();
  });

  it('pause and resume drive the element and session state', async () => {
    const player = await load();
    await player.play(rec);
    player.pause();
    expect(session.setPlaybackState).toHaveBeenLastCalledWith({ playbackState: 'paused' });
    await player.resume();
    expect(FakeAudio.last.paused).toBe(false);
  });

  it('ignores the rejection of a play superseded by a newer source', async () => {
    const player = await load();
    let reject!: (e: Error) => void;
    const hang = new Promise<void>((_, rej) => (reject = rej));
    FakeAudio.hangNext = hang;
    const first = player.play(rec);
    await player.play({ ...rec, url: 'https://x/b.mp3' });
    reject(new DOMException('aborted', 'AbortError'));
    await first;
    expect(player.state.error).toBeNull();
    expect(player.state.src?.url).toBe('https://x/b.mp3');
  });
});
