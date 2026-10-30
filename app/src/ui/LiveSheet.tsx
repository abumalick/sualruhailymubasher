import type { LiveDTO } from '@albadr/shared';
import { Icon } from './Star';

export function LiveSheet({ live, onClose }: { live: LiveDTO; onClose: () => void }) {
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
      <p class="note">لمواصلة الاستماع أبقِ الشاشة مفتوحة</p>
    </div>
  );
}
