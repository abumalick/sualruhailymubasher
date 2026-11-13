import { nativeUI } from '../platform';
import { Icon } from './Star';

const Row = ({ href, icon, title, hint }: { href: string; icon: string; title: string; hint: string }) => (
  <a class="lesson" href={href}>
    <span class="mini dashed">
      <Icon id={icon} />
    </span>
    <div class="t">
      <span class="b">{title}</span>
      <span class="m">{hint}</span>
    </div>
    <Icon id="i-back" class="fwd" />
  </a>
);

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
        <Row href="#/welcome" icon="i-info" title="كيف يعمل التطبيق" hint="جولة قصيرة في التطبيق" />
        <Row href="#/links" icon="i-link" title="روابط" hint="الموقع والقنوات والمجتمعات" />
        <Row href="#/about" icon="i-info" title="عن التطبيق" hint="المصادر وسياسة الخصوصية" />
      </div>
    </>
  );
}
