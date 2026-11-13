import { useEffect, useRef, useState } from 'preact/hooks';
import { player, type PlayerState } from '../audio/player';
import { formatTime, keyTarget, pointerToTime, SKIP_SECONDS } from '../logic/seek';
import { ar } from './format';
import { Icon } from './Star';

export function usePlayer() {
  const [s, setS] = useState(player.state);
  useEffect(() => {
    setS(player.state);
    return player.onChange(setS);
  }, []);
  return s;
}

// What the bar can ask of the player; the onboarding's preview draws the same bar with none of them wired.
export interface PlayerActions {
  toggle: () => void;
  skip: (delta: number) => void;
  seek: (to: number) => void;
}

const PLAYER: PlayerActions = {
  toggle: () => (player.state.playing ? player.pause() : void player.resume()),
  skip: (delta) => player.skip(delta),
  seek: (to) => player.seek(to),
};

const PlayButton = ({ s, act }: { s: PlayerState; act: PlayerActions }) => (
  <button class="mini" aria-label={s.playing ? 'إيقاف مؤقت' : 'تشغيل'} onClick={act.toggle}>
    <Icon id={s.playing ? 'i-pause' : 'play'} />
  </button>
);

const Skip = ({ delta, ready, act }: { delta: number; ready: boolean; act: PlayerActions }) => (
  <button
    class={delta < 0 ? 'skip' : 'skip fwd'}
    aria-label={`${delta < 0 ? 'رجوع' : 'تقديم'} ${ar(SKIP_SECONDS)} ثانية`}
    disabled={!ready}
    onClick={() => act.skip(delta)}
  >
    <Icon id="i-rev" />
    <span aria-hidden="true">{ar(SKIP_SECONDS)}</span>
  </button>
);

const DIGITS = '٠١٢٣٤٥٦٧٨٩';

// The font's Arabic digits differ in width: hidden copies of the label's shape in every digit keep the widest
// in place, so the bar never moves as the time counts up.
const Clock = ({ text, shape }: { text: string; shape: string }) => (
  <time>
    <span>{text}</span>
    {[...DIGITS].map((d) => (
      <span key={d} class="w" aria-hidden="true">
        {shape.replace(/[٠-٩]/g, d)}
      </span>
    ))}
  </time>
);

// Media timelines run left to right in Arabic too (tape direction), as the play triangle does.
function Scrubber({ position, duration, act }: { position: number; duration: number; act: PlayerActions }) {
  const [drag, setDrag] = useState<number | null>(null);
  const pointer = useRef<number | null>(null);
  const ready = duration > 0;
  const shown = drag ?? position;
  const total = ready ? formatTime(duration) : '--:--';
  const pct = ready ? Math.min(100, (shown / duration) * 100) : 0;
  const at = (e: PointerEvent) => pointerToTime(e.clientX, (e.currentTarget as HTMLElement).getBoundingClientRect(), duration, 'ltr');
  const mine = (e: PointerEvent) => pointer.current === e.pointerId;
  const end = (e: PointerEvent) => {
    if (!mine(e)) return;
    pointer.current = null;
    setDrag(null);
  };
  return (
    <div class="seek" dir="ltr">
      <Clock text={formatTime(shown, duration)} shape={total} />
      <div
        class="rail"
        role="slider"
        tabIndex={ready ? 0 : -1}
        aria-label="موضع التسجيل"
        aria-disabled={!ready}
        aria-valuemin={0}
        aria-valuemax={Math.floor(duration)}
        aria-valuenow={Math.floor(shown)}
        aria-valuetext={`${formatTime(shown, duration)} من ${total}`}
        onPointerDown={(e) => {
          if (!ready || pointer.current !== null || e.button !== 0) return;
          pointer.current = e.pointerId;
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          setDrag(at(e));
        }}
        onPointerMove={(e) => mine(e) && setDrag(at(e))}
        onPointerUp={(e) => {
          if (!mine(e)) return;
          act.seek(at(e));
          end(e);
        }}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onKeyDown={(e) => {
          const target = ready ? keyTarget(e.key, position, duration) : null;
          if (target === null) return;
          e.preventDefault();
          act.seek(target);
        }}
      >
        <i class="prog" style={{ width: `${pct}%` }} />
        <b style={{ left: `${pct}%` }} />
      </div>
      <Clock text={total} shape={total} />
    </div>
  );
}

export function MiniPlayer() {
  const s = usePlayer();
  return <PlayerBar s={s} act={PLAYER} />;
}

export function PlayerBar({ s, act }: { s: PlayerState; act: PlayerActions }) {
  if (!s.src) return null;
  const meta = (
    <div class="t">
      <span class="b">{s.src.title}</span>
      <span class="m">{s.error ?? (s.src.kind === 'live' ? 'بث مباشر' : s.src.subtitle)}</span>
    </div>
  );
  if (s.src.kind === 'live')
    return (
      <div class="mp">
        <PlayButton s={s} act={act} />
        {meta}
      </div>
    );
  const ready = s.duration > 0;
  return (
    <div class="mp rec">
      <div class="ctl" dir="ltr">
        <Skip delta={-SKIP_SECONDS} ready={ready} act={act} />
        <PlayButton s={s} act={act} />
        <Skip delta={SKIP_SECONDS} ready={ready} act={act} />
      </div>
      {meta}
      <Scrubber key={s.src.url} position={s.position} duration={s.duration} act={act} />
    </div>
  );
}
