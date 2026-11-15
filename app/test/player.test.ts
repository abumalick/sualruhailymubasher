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
      expect.objectContaining({ title: 'الدرس ٣', artist: 'الشيخ سليمان الرحيلي', artwork: [expect.objectContaining({ type: 'image/png' })] }),
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

  it('stop clears the source and leaves the media session stopped, even when the pause event lands later', async () => {
    const player = await load();
    await player.play(rec);
    const a = FakeAudio.last;
    a.pause = vi.fn(() => {
      a.paused = true;
      setTimeout(() => a.dispatchEvent(new Event('pause')));
    });
    player.stop();
    await new Promise((r) => setTimeout(r, 5));
    expect(player.state.src).toBeNull();
    expect(session.setPlaybackState).toHaveBeenLastCalledWith({ playbackState: 'none' });
  });

  it('clamps a seek to the recording', async () => {
    const player = await load();
    await player.play(rec);
    loaded(3521);
    player.seek(9999);
    expect(FakeAudio.last.currentTime).toBe(3521);
    player.seek(-5);
    expect(FakeAudio.last.currentTime).toBe(0);
  });

  it('skips 15 seconds back and forward, and reports the new position to the media session', async () => {
    const player = await load();
    await player.play(rec);
    loaded(3521);
    FakeAudio.last.currentTime = 600;
    player.skip(-15);
    expect(FakeAudio.last.currentTime).toBe(585);
    expect(player.state.position).toBe(585);
    expect(session.setPositionState).toHaveBeenLastCalledWith({ duration: 3521, position: 585, playbackRate: 1 });
    player.skip(15);
    player.skip(15);
    expect(FakeAudio.last.currentTime).toBe(615);
  });

  it('does not skip on the live stream', async () => {
    const player = await load();
    await player.play(live);
    expect(() => player.skip(15)).toThrow();
  });

  it('wires the notification seek backward and forward once a recording plays', async () => {
    const player = await load();
    await player.play(live);
    expect(actions()).not.toContain('seekbackward');
    await player.play(rec);
    await player.play({ ...rec, url: 'https://x/b.mp3' });
    expect(actions().filter((a) => a === 'seekbackward')).toHaveLength(1);
    expect(actions().filter((a) => a === 'seekforward')).toHaveLength(1);
    loaded(3521);
    FakeAudio.last.currentTime = 600;
    handler('seekbackward')({ action: 'seekbackward' });
    expect(FakeAudio.last.currentTime).toBe(585);
    handler('seekforward')({ action: 'seekforward' });
    handler('seekforward')({ action: 'seekforward' });
    expect(FakeAudio.last.currentTime).toBe(615);
  });

  it('ignores the notification seek buttons on the live stream and the live embed', async () => {
    const player = await load();
    await player.play(rec);
    await player.play(live);
    expect(() => handler('seekforward')({ action: 'seekforward' })).not.toThrow();
    player.stop();
    player.startEmbed('مباشر', () => {});
    expect(() => handler('seekbackward')({ action: 'seekbackward' })).not.toThrow();
  });
});

type Handler = (d: { action: string; seekTime?: number | null }) => void;
const calls = () => session.setActionHandler.mock.calls as unknown as [{ action: string }, Handler][];
const actions = () => calls().map(([o]) => o.action);
const handler = (action: string) => calls().filter(([o]) => o.action === action).at(-1)![1];
function loaded(duration: number) {
  FakeAudio.last.duration = duration;
  FakeAudio.last.dispatchEvent(new Event('loadedmetadata'));
}
