import type { CourseDTO, StateDTO } from '@albadr/shared';
import { useState } from 'preact/hooks';
import { courseLabel, noticeFor, summary, type Follow } from '../logic/follow';
import { askPermission, pushPermission } from '../push';
import { navigate } from '../router';
import { chooseCourses, dismissFollowHint, refresh } from '../store';
import { clock12, schedule, slotName } from './format';
import { Icon } from './Star';

export function Chooser({ state, follow, first, onHold }: { state: StateDTO | null; follow: Follow | null; first: boolean; onHold?: (hold: boolean) => void }) {
  const [picked, setPicked] = useState<string[]>(() => (first ? [] : (follow?.ids ?? [])));
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
    const askNext = first && (await pushPermission()).startsWith('prompt');
    if (askNext) {
      onHold?.(true);
      setAsk(true);
    }
    await chooseCourses(listed);
    if (!askNext) finish();
  };
  const label = summary(courses, listed);

  return (
    <div class="choose">
      {first ? (
        <div class="intro">
          <small>عبد الرزاق البدر · الدروس العلمية</small>
          <h3>أيَّ الدروس تتابع؟</h3>
          <p>يعرض التطبيق الدروس التي تختارها فقط، ولا تصلك إلا تنبيهاتها. يمكنك تغيير اختيارك متى شئت.</p>
        </div>
      ) : (
        <div class="bar">
          <a class="back" href="#/" aria-label="رجوع">
            <Icon id="i-back" />
          </a>
          <div class="t">
            <b>الدروس التي تتابعها</b>
            <span>يتغيّر معها ما تراه وما يصلك من تنبيهات</span>
          </div>
        </div>
      )}
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
            {courses.length === 0
              ? first
                ? 'متابعة'
                : 'رجوع'
              : listed.length === 0
                ? 'اختر درسًا واحدًا على الأقل'
                : `${first ? 'متابعة' : 'حفظ'} · ${label}`}
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

export function FollowNotice({ state, follow, always = false }: { state: StateDTO; follow: Follow; always?: boolean }) {
  const notice = noticeFor(state, follow, always);
  if (!notice) return null;
  if (notice.kind === 'hint') {
    return (
      <div class="card reach notice">
        <span class="b">جديد: يمكنك اختيار الدروس التي تتابعها</span>
        <span class="m">فيعرض التطبيق ما تختاره فقط، ولا تصلك إلا تنبيهاته.</span>
        <div class="acts start">
          <a class="chip pri" href="#/follow">
            اختر الدروس
          </a>
          <button class="chip" onClick={() => void dismissFollowHint()}>
            إخفاء
          </button>
        </div>
      </div>
    );
  }
  return (
    <a class="followed" href="#/follow">
      <span>
        {notice.kind === 'none-listed' && 'لا يُعرض لك أي درس حاليًا'}
        {notice.kind === 'fresh' && `درس جديد: ${courseLabel(notice.course, state.courses)} · ${notice.course.title}`}
        {notice.kind === 'followed' && `دروسك: ${notice.summary}`}
        {notice.kind === 'followed' && notice.hidden && <small>{notice.hidden} مستمر، ولا يظهر لك لأنك لا تتابعه</small>}
      </span>
      <u>تغيير</u>
    </a>
  );
}

export function NotFollowed() {
  return (
    <div class="booker">
      <p class="quiet">لا تتابع هذا الدرس</p>
      <a class="chip" href="#/follow">
        تغيير الدروس
      </a>
    </div>
  );
}
