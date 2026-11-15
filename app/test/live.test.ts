import type { StateDTO } from '@sualruhaily/shared';
import { beforeEach, expect, it, vi } from 'vitest';

const p = vi.hoisted(() => ({ play: vi.fn(async () => {}), pause: vi.fn(), resume: vi.fn(async () => {}), state: { src: null, playing: false } as { src: { url: string; kind: string } | null; playing: boolean } }));
vi.mock('../src/audio/player', () => ({ player: p }));
import { startLive } from '../src/audio/live';

const state = (live: Partial<StateDTO['live']>) =>
  ({ generatedAt: '', links: [], courses: [{ id: 'c1', title: 'الأصول' }], live: { isLive: true, mode: 'embed', embedUrl: 'u', streamUrl: null, courseId: 'c1', startedAt: null, ...live } }) as unknown as StateDTO;

beforeEach(() => {
  vi.clearAllMocks();
  p.state = { src: null, playing: false };
});

it('embed mode pauses the player and opens the sheet', () => {
  const open = vi.fn();
  startLive(state({}), open);
  expect(p.pause).toHaveBeenCalled();
  expect(open).toHaveBeenCalled();
  expect(p.play).not.toHaveBeenCalled();
});

it('direct mode plays the stream without the sheet', () => {
  const open = vi.fn();
  startLive(state({ mode: 'direct', streamUrl: 'https://s/live' }), open);
  expect(p.play).toHaveBeenCalledWith({ url: 'https://s/live', title: 'الأصول', subtitle: '', kind: 'live', courseId: 'c1' });
  expect(open).not.toHaveBeenCalled();
});

it('direct mode resumes a paused stream that is already loaded instead of restarting it', () => {
  p.state = { src: { url: 'https://s/live', kind: 'live' }, playing: false };
  startLive(state({ mode: 'direct', streamUrl: 'https://s/live' }), vi.fn());
  expect(p.play).not.toHaveBeenCalled();
  expect(p.resume).toHaveBeenCalled();
});

it('direct mode leaves a stream that is already playing alone', () => {
  p.state = { src: { url: 'https://s/live', kind: 'live' }, playing: true };
  startLive(state({ mode: 'direct', streamUrl: 'https://s/live' }), vi.fn());
  expect(p.play).not.toHaveBeenCalled();
  expect(p.resume).not.toHaveBeenCalled();
});
