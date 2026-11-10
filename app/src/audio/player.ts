import { MediaSession } from '@capgo/capacitor-media-session';
import { ARTWORK } from './artwork';

export interface PlayerSrc {
  url: string;
  title: string;
  subtitle: string;
  kind: 'live' | 'recording';
  courseId?: string | null;
}
export interface PlayerState {
  src: PlayerSrc | null;
  playing: boolean;
  position: number;
  duration: number;
  error: string | null;
}

const ARTIST = 'الشيخ عبد الرزاق البدر';
const listeners = new Set<(s: PlayerState) => void>();
let audio: HTMLAudioElement | null = null;
let state: PlayerState = { src: null, playing: false, position: 0, duration: 0, error: null };

function set(patch: Partial<PlayerState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

const quiet = (p: Promise<unknown>) => void p.catch((e) => console.warn('media session', e));

const POSITION_INTERVAL_MS = 5000;
let lastPositionSent = 0;

function syncPosition(force = true) {
  if (!audio) return;
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  set({ position: audio.currentTime, duration });
  const now = Date.now();
  if (state.src?.kind === 'recording' && duration > 0 && (force || now - lastPositionSent >= POSITION_INTERVAL_MS)) {
    lastPositionSent = now;
    quiet(MediaSession.setPositionState({ duration, position: audio.currentTime, playbackRate: 1 }));
  }
}

function setPlaying(playing: boolean) {
  set({ playing });
  // After stop() the element's pause event arrives late; reporting it would restart the media notification.
  if (!state.src) return;
  syncPosition();
  quiet(MediaSession.setPlaybackState({ playbackState: playing ? 'playing' : 'paused' }));
}

function element(): HTMLAudioElement {
  if (audio) return audio;
  const a = new Audio();
  a.preload = 'auto';
  a.addEventListener('play', () => setPlaying(true));
  a.addEventListener('pause', () => setPlaying(false));
  a.addEventListener('ended', () => setPlaying(false));
  a.addEventListener('timeupdate', () => syncPosition(false));
  a.addEventListener('loadedmetadata', () => syncPosition());
  a.addEventListener('durationchange', () => syncPosition());
  a.addEventListener('error', () => {
    set({ playing: false, error: 'تعذّر تشغيل الصوت' });
    quiet(MediaSession.setPlaybackState({ playbackState: 'paused' }));
  });
  audio = a;
  registerHandlers();
  return a;
}

let handlersRegistered = false;
let stopEmbed: (() => void) | null = null;

function registerHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;
  quiet(
    MediaSession.setActionHandler({ action: 'play' }, () => {
      if (!stopEmbed) void player.resume();
    }),
  );
  quiet(MediaSession.setActionHandler({ action: 'pause' }, () => (stopEmbed ? stopEmbed() : player.pause())));
  quiet(
    MediaSession.setActionHandler({ action: 'seekto' }, (d) => {
      if (state.src?.kind === 'recording' && d.seekTime != null) player.seek(d.seekTime);
    }),
  );
}

export const player = {
  async play(src: PlayerSrc): Promise<void> {
    const a = element();
    if (!a.paused) a.pause();
    a.src = src.url;
    set({ src, playing: false, position: 0, duration: 0, error: null });
    quiet(
      MediaSession.setMetadata({
        title: src.title,
        artist: ARTIST,
        album: src.subtitle,
        artwork: [{ src: ARTWORK, sizes: '512x512', type: 'image/png' }],
      }),
    );
    try {
      await a.play();
    } catch {
      if (state.src === src) set({ playing: false, error: 'تعذّر تشغيل الصوت' });
    }
  },

  pause(): void {
    audio?.pause();
  },

  stop(): void {
    audio?.pause();
    set({ src: null, playing: false, position: 0, duration: 0, error: null });
    quiet(MediaSession.setPlaybackState({ playbackState: 'none' }));
  },

  async resume(): Promise<void> {
    if (!audio || !state.src) return;
    const src = state.src;
    set({ error: null });
    try {
      await audio.play();
    } catch {
      if (state.src === src) set({ playing: false, error: 'تعذّر تشغيل الصوت' });
    }
  },

  // The live embed plays in a cross-origin iframe we cannot observe; the media session only keeps it
  // alive in the background and lets the notification's pause close it.
  startEmbed(title: string, onStop: () => void): void {
    stopEmbed = onStop;
    registerHandlers();
    quiet(MediaSession.setMetadata({ title, artist: ARTIST, album: '', artwork: [{ src: ARTWORK, sizes: '512x512', type: 'image/png' }] }));
    quiet(MediaSession.setPositionState({ duration: 0, position: 0, playbackRate: 1 }));
    quiet(MediaSession.setPlaybackState({ playbackState: 'playing' }));
  },

  endEmbed(): void {
    if (!stopEmbed) return;
    stopEmbed = null;
    quiet(MediaSession.setPlaybackState({ playbackState: 'none' }));
  },

  seek(sec: number): void {
    if (!audio || state.src?.kind !== 'recording') throw new Error('seek is only available for recordings');
    audio.currentTime = Math.max(0, sec);
    syncPosition();
  },

  onChange(cb: (s: PlayerState) => void): () => void {
    listeners.add(cb);
    return () => void listeners.delete(cb);
  },

  get state(): PlayerState {
    return state;
  },
};
