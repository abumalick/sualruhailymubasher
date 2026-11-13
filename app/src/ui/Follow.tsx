import type { CourseDTO, StateDTO } from '@albadr/shared';
import { useState } from 'preact/hooks';
import { topicsFor } from '../logic/topics';
import { askPermission, pushPermission } from '../push';
import { nativeUI } from '../platform';
import { navigate } from '../router';
import { finishOnboarding, refresh } from '../store';
import { clock12, courseLabel, schedule, slotName, summary } from './format';
import { Icon } from './Star';

export function Chooser({ state, onHold }: { state: StateDTO | null; onHold?: (hold: boolean) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [ask, setAsk] = useState(false);
  const courses = state?.courses ?? [];
  const listed = picked.filter((id) => courses.some((c) => c.id === id));

  const finish = () => {
    navigate('#/');
    onHold?.(false);
  };
  if (ask) return <NotifyStep courses={courses} ids={listed} onDone={finish} />;

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const save = async () => {
    const askNext = (await pushPermission()).startsWith('prompt');
    if (askNext) {
      onHold?.(true);
      setAsk(true);
    }
    await finishOnboarding({ wanted: topicsFor(listed), known: courses.map((c) => [c.id, c.slot]) });
    if (!askNext) finish();
  };
  const label = summary(courses, listed);

  return (
    <div class="choose">
      <div class="intro">
        <small>عبد الرزاق البدر · الدروس العلمية</small>
        <h3>أيَّ الدروس تتابع؟</h3>
        <p>{nativeUI() ? 'تصلك تنبيهات الدروس التي تختارها. يمكنك تغيير اختيارك متى شئت.' : 'يمكنك تغيير اختيارك متى شئت.'}</p>
      </div>
      {!state ? (
        <div class="booker">
          <p class="quiet">نحتاج اتصالًا بالإنترنت لعرض الدروس</p>
          <button class="chip" onClick={() => void refresh()}>
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <>
          <div class="picks">
            {courses.map((c) => (
              <Pick key={c.id} course={c} all={courses} on={picked.includes(c.id)} onToggle={() => toggle(c.id)} />
            ))}
          </div>
          {courses.length === 0 && <p class="quiet">لا توجد دروس حاليًا، وسيظهر لك كل درس جديد هنا.</p>}
          <button class="chip pri wide" disabled={courses.length > 0 && listed.length === 0} onClick={() => void save()}>
            {courses.length === 0 ? 'متابعة' : listed.length === 0 ? 'اختر درسًا واحدًا على الأقل' : `متابعة · ${label}`}
          </button>
        </>
      )}
    </div>
  );
}

function Pick({ course: c, all, on, onToggle }: { course: CourseDTO; all: CourseDTO[]; on: boolean; onToggle: () => void }) {
  const label = courseLabel(c, all);
  return (
    <button type="button" role="checkbox" aria-checked={on} class={on ? 'pick on' : 'pick'} onClick={onToggle}>
      <span class="box">{on && <Icon id="i-check" />}</span>
      <span class="t">
        <b>{label}</b>
        {label !== c.title && <span class="b">{c.title}</span>}
        <span class="m">
          بعد {slotName(c.slot)} · {schedule(c.weekdays)} · نحو {clock12(c.time)}
        </span>
      </span>
    </button>
  );
}

function NotifyStep({ courses, ids, onDone: done }: { courses: CourseDTO[]; ids: string[]; onDone: () => void }) {
  return (
    <div class="choose">
      <div class="intro">
        <Icon id="i-bell" class="big" />
        <h3>فعّل التنبيهات</h3>
        <p>
          {ids.length > 0
            ? `تصلك بداية البث المباشر، وتذكير التحضير، وإشعار التسجيل للمراجعة: ${summary(courses, ids)}.`
            : 'يصلك تنبيه عند بدء أي بث مباشر.'}
        </p>
      </div>
      <button class="chip pri wide" onClick={() => void askPermission().then(done)}>
        فعّل التنبيهات
      </button>
      <button class="chip wide plain" onClick={done}>
        ليس الآن
      </button>
    </div>
  );
}
