import { Defs } from './Star';

export function UpdateRequired({ url }: { url: string | null }) {
  return (
    <div class="shell">
      <Defs />
      <main class="update-required">
        <h1>يلزم تحديث التطبيق</h1>
        <p>هذا الإصدار لم يعد يعمل. حدّث التطبيق لمتابعة الدروس.</p>
        {url && (
          <a class="chip pri" href={url} target="_blank" rel="noopener noreferrer">
            تحديث
          </a>
        )}
      </main>
    </div>
  );
}

export function UpdateBanner({ url, onClose }: { url: string | null; onClose: () => void }) {
  return (
    <aside class="install update" aria-label="تحديث التطبيق">
      <div class="t">
        <b>يتوفر تحديث للتطبيق</b>
      </div>
      {url && (
        <a class="chip pri" href={url} target="_blank" rel="noopener noreferrer">
          تحديث
        </a>
      )}
      <button class="x" aria-label="إغلاق التحديث" onClick={onClose}>
        <span class="g">×</span>
      </button>
    </aside>
  );
}
