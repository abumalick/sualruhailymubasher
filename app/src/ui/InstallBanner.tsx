import { useState } from 'preact/hooks';
import appStoreBadge from '../badges/app-store-ar.svg';
import googlePlayBadge from '../badges/google-play-ar.png';
import { installStores, type StoreId } from '../logic/install';
import { nativeUI } from '../platform';
import { STORES } from '../site';

const KEY = 'install-banner-dismissed';
// Official Arabic badges, unaltered. Google's PNG carries its own clear space, which `.play` crops back into the CSS clear space.
const BADGES: Record<StoreId, { src: string; alt: string; width: number; height: number }> = {
  appstore: { src: appStoreBadge, alt: 'تنزيل من App Store', width: 120, height: 40 },
  play: { src: googlePlayBadge, alt: 'احصل عليه من Google Play', width: 154, height: 60 },
};
// Holds a dismissal for the visit when the browser refuses storage.
let dismissedThisVisit = false;

export const resetInstallBanner = () => {
  dismissedThisVisit = false;
};

function wasDismissed(): boolean {
  if (dismissedThisVisit) return true;
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function dismiss() {
  dismissedThisVisit = true;
  try {
    localStorage.setItem(KEY, '1');
  } catch {}
}

export function InstallBanner() {
  const [dismissed, setDismissed] = useState(wasDismissed);
  const ids = installStores({ nativeUI: nativeUI(), ua: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints ?? 0, dismissed });
  if (!ids) return null;
  return (
    <aside class={ids.length > 1 ? 'install two' : 'install'} aria-label="تطبيق الجوال">
      <div class="t">
        <b>البدر مباشر على جوالك</b>
        <span>تنبيه عند بدء البث</span>
      </div>
      <div class="badges">
        {STORES.filter((s) => ids.includes(s.id)).map((s) => (
          <a class={s.id} href={s.url} target="_blank" rel="noopener noreferrer" key={s.id}>
            <img {...BADGES[s.id]} />
          </a>
        ))}
      </div>
      <button
        class="x"
        aria-label="إغلاق"
        onClick={() => {
          dismiss();
          setDismissed(true);
        }}
      >
        <span class="g">×</span>
      </button>
    </aside>
  );
}
