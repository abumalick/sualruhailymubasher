import { useEffect, useState } from 'preact/hooks';
import { player } from '../audio/player';
import { Icon } from './Star';

export function usePlayer() {
  const [s, setS] = useState(player.state);
  useEffect(() => {
    setS(player.state);
    return player.onChange(setS);
  }, []);
  return s;
}

export function MiniPlayer() {
  const s = usePlayer();
  if (!s.src) return null;
  const pct = s.duration > 0 ? Math.min(100, (s.position / s.duration) * 100) : 0;
  return (
    <div class="mp">
      <button class="mini" aria-label={s.playing ? 'إيقاف مؤقت' : 'تشغيل'} onClick={() => (s.playing ? player.pause() : void player.resume())}>
        <Icon id={s.playing ? 'i-pause' : 'play'} />
      </button>
      <div class="t">
        <span class="b">{s.src.title}</span>
        <span class="m">{s.error ?? (s.src.kind === 'live' ? 'بث مباشر' : s.src.subtitle)}</span>
      </div>
      {s.src.kind === 'recording' && <i class="prog" style={{ width: `${pct}%` }} />}
    </div>
  );
}
