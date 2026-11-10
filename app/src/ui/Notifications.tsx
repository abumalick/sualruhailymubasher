import { courseTopic, LIVE_OTHER_TOPIC, type CourseDTO, type StateDTO } from '@albadr/shared';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { askPermission, loadTopics, pushPermission, setTopic } from '../push';
import { slotName } from './format';

const REMINDER = {
  fajr: 'مساء اليوم السابق · ٩:٠٠ م',
  maghrib: 'عصر يوم الدرس · ٣:٣٠ م',
};

function Toggle({ label, hint, on, onToggle }: { label: string; hint?: string; on: boolean; onToggle: () => void }) {
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

export function Notifications({ state, notice }: { state: StateDTO | null; notice?: ComponentChildren }) {
  const [topics, setTopics] = useState<string[] | null>(null);
  const [permission, setPermission] = useState('granted');
  const courseIds = state?.courses.map((c) => c.id).join(',');
  useEffect(() => {
    void loadTopics(state).then(setTopics);
  }, [courseIds]);
  useEffect(() => {
    void pushPermission().then(setPermission);
  }, []);

  const on = (topic: string) => topics?.includes(topic) ?? false;
  const toggle = async (topic: string) => {
    const next = await setTopic(topic, !on(topic));
    if (next) setTopics(next);
  };
  const row = (topic: string, label: string, hint?: string) => (
    <Toggle label={label} hint={hint} on={on(topic)} onToggle={() => void toggle(topic)} />
  );

  return (
    <>
      <div class="bar">
        <div class="t">
          <b>التنبيهات</b>
          <span>اختر ما يصلك من كل درس تتابعه</span>
        </div>
      </div>
      {notice}
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
      {topics &&
        state?.courses.map((c: CourseDTO) => (
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
      {topics && (
        <section class="notifs">
          <p class="sec">بث مباشر آخر</p>
          <div class="card">{row(LIVE_OTHER_TOPIC, 'بدء البث المباشر')}</div>
        </section>
      )}
    </>
  );
}
