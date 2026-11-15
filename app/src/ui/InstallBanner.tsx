import { useState } from 'preact/hooks';
import { installStores } from '../logic/install';
import { nativeUI } from '../platform';
import { StoreBadges } from './StoreBadges';

const KEY = 'install-banner-dismissed';
// Holds a dismissal for the visit when the browser refuses storage.
let dismissedThisVisit = false;

export const resetInstallBanner = () => {
  dismissedThisVisit = false;
};

// The onboarding's last web step has just made the same invite: not again on the screen right after it. Nothing is stored,
// so the banner is back on the next visit.
export const hideInstallBannerThisVisit = () => {
  dismissedThisVisit = true;
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
      <StoreBadges ids={ids} />
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
