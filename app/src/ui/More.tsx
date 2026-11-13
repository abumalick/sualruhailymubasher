import { useEffect, useRef, useState } from 'preact/hooks';
import { shareHint } from '../logic/share';
import { nativeUI } from '../platform';
import { deviceShareEnv, shareApp } from '../share';
import { Icon } from './Star';

const RowBody = ({ icon, title, hint, live }: { icon: string; title: string; hint: string; live?: boolean }) => (
  <>
    <span class="mini dashed">
      <Icon id={icon} />
    </span>
    <div class="t">
      <span class="b">{title}</span>
      <span class="m" aria-live={live ? 'polite' : undefined}>
        {hint}
      </span>
    </div>
    <Icon id="i-back" class="fwd" />
  </>
);

const Row = ({ href, ...body }: { href: string; icon: string; title: string; hint: string }) => (
  <a class="lesson" href={href}>
    <RowBody {...body} />
  </a>
);

const SHARE_HINT = 'أرسل رابط التطبيق لمن تحب';

function ShareRow() {
  const [hint, setHint] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const busy = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  // A second share call while the sheet is open is rejected, which would look like a failure and copy the link.
  const share = async () => {
    if (busy.current) return;
    busy.current = true;
    const outcome = await shareApp(deviceShareEnv()).finally(() => (busy.current = false));
    const message = shareHint(outcome);
    if (!message) return;
    clearTimeout(timer.current);
    setHint(message);
    timer.current = setTimeout(() => setHint(null), 4000);
  };
  return (
    <button class="lesson" type="button" onClick={share}>
      <RowBody icon="i-share" title="شارك التطبيق" hint={hint ?? SHARE_HINT} live />
    </button>
  );
}

export function More() {
  return (
    <>
      <div class="bar">
        <div class="t">
          <b>المزيد</b>
        </div>
      </div>
      <div class="card more">
        {nativeUI() && <Row href="#/notifications" icon="i-bell" title="التنبيهات" hint="اختر ما يصلك من كل درس" />}
        <Row href="#/welcome" icon="i-book" title="كيف يعمل التطبيق" hint="جولة قصيرة في التطبيق" />
        <Row href="#/links" icon="i-link" title="روابط" hint="الموقع والقنوات والمجتمعات" />
        <Row href="#/about" icon="i-info" title="عن التطبيق" hint="المصادر وسياسة الخصوصية" />
        <ShareRow />
      </div>
    </>
  );
}
