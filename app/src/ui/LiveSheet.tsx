import type { LiveDTO } from '@albadr/shared';
import { useEffect } from 'preact/hooks';
import { player } from '../audio/player';
import { Icon } from './Star';

export function LiveSheet({ live, title, onClose }: { live: LiveDTO; title: string; onClose: () => void }) {
  useEffect(() => {
    player.startEmbed(title, onClose);
    return () => player.endEmbed();
  }, []);
  return (
    <div class="sheet" role="dialog" aria-label="البث المباشر">
      <div class="bar">
        <button class="back" aria-label="إغلاق" onClick={onClose}>
          <Icon id="i-back" />
        </button>
        <div class="t">
          <b>البث المباشر</b>
        </div>
      </div>
      <iframe src={live.embedUrl} allow="autoplay" title="البث المباشر" />
    </div>
  );
}
