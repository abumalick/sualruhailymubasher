import { useState } from 'preact/hooks';
import { installStores } from '../logic/install';
import { nativeUI } from '../platform';
import { STORES } from '../site';

const KEY = 'install-banner-dismissed';
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
    <aside class="install" aria-label="تطبيق الجوال">
      <img src="/apple-touch-icon.png" alt="" width={40} height={40} />
      <div class="t">
        <b>البدر مباشر على جوالك</b>
        <span>تنبيه عند بدء البث، وتذكير بالتحضير والمراجعة</span>
        <div class="acts start">
          {STORES.filter((s) => ids.includes(s.id)).map((s) => (
            <a class="chip pri" href={s.url} target="_blank" rel="noopener noreferrer" key={s.id}>
              {s.name}
            </a>
          ))}
        </div>
      </div>
      <button
        class="x"
        aria-label="إغلاق"
        onClick={() => {
          dismiss();
          setDismissed(true);
        }}
      >
        ×
      </button>
    </aside>
  );
}
