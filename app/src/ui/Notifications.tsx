import { courseTopic, LIVE_OTHER_TOPIC, type CourseDTO, type StateDTO } from '@albadr/shared';
import { useEffect, useState } from 'preact/hooks';
import type { Prefs } from '../logic/prefs';
import { askPermission, pushPermission } from '../push';
import { Back } from './Back';
import { REMINDER, slotName } from './format';

export function Toggle({ label, hint, on, onToggle }: { label: string; hint?: string; on: boolean; onToggle: () => void }) {
  return (
    <div class="lesson">
      <div class="t">
        <span class="b">{label}</span>
        {hint && <span class="m">{hint}</span>}
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label={label} class={on ? 'tog on' : 'tog'} onClick={onToggle} />
    </div>
  );
}

export function Notifications({ state, prefs, onToggle }: { state: StateDTO | null; prefs: Prefs | null; onToggle: (topic: string, on: boolean) => void }) {
  const [permission, setPermission] = useState('granted');
  useEffect(() => {
    void pushPermission().then(setPermission);
  }, []);

  const on = (topic: string) => prefs?.wanted.includes(topic) ?? false;
  const row = (topic: string, label: string, hint?: string) => <Toggle label={label} hint={hint} on={on(topic)} onToggle={() => onToggle(topic, !on(topic))} />;

  return (
    <>
      <div class="bar">
        <Back fallback="#/more" />
        <div class="t">
          <b>التنبيهات</b>
          <span>اختر ما يصلك من كل درس</span>
        </div>
      </div>
      {permission.startsWith('prompt') && (
        <div class="card reach">
          <span class="b">التنبيهات غير مفعّلة على هذا الجهاز</span>
          <div class="acts start">
            <button class="chip pri" onClick={() => void askPermission().then(setPermission)}>
              فعّل التنبيهات
            </button>
          </div>
        </div>
      )}
      {permission === 'denied' && <p class="quiet">الإشعارات متوقفة من إعدادات الجهاز، واختياراتك محفوظة وستعمل عند تفعيلها.</p>}
      {state &&
        state.courses.map((c: CourseDTO) => (
          <section class="notifs" key={c.id}>
            <p class="sec">
              درس {slotName(c.slot)} · {c.title}
            </p>
            <div class="card">
              {row(courseTopic(c.id, 'live'), 'بدء البث المباشر')}
              {row(courseTopic(c.id, 'rec'), 'التسجيل متاح للمراجعة')}
              {row(courseTopic(c.id, 'prep'), 'تذكير بالتحضير', REMINDER[c.slot])}
            </div>
          </section>
        ))}
      {state && (
        <section class="notifs">
          <p class="sec">بث مباشر آخر</p>
          <div class="card">{row(LIVE_OTHER_TOPIC, 'بدء البث المباشر')}</div>
        </section>
      )}
    </>
  );
}
