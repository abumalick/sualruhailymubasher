import type { CourseDTO, StateDTO } from '@albadr/shared';
import { useEffect, useState } from 'preact/hooks';
import { asksPermission, cardFor, finalPrefs, initialDraft, hasSwitch, pick, pickedCourses, setStep, stepHint, stepOn, STEPS, type Draft, type Step } from '../logic/onboarding';
import type { Prefs } from '../logic/prefs';
import { nativeUI } from '../platform';
import { askPermission, pushPermission } from '../push';
import { refresh } from '../store';
import { ar, clock12, courseLabel, schedule, slotName } from './format';
import { Toggle } from './Notifications';
import { Preview } from './Preview';
import { Icon } from './Star';

const TEXT: Record<Exclude<Step, 'app'>, { title: string; body: string; switches: string; fallback: string }> = {
  live: {
    title: 'استمع مباشرةً',
    body: 'يُبَثّ الدرس من المسجد النبوي وقت إلقائه، فتستمع إليه من هنا أينما كنت.',
    switches: 'نبّهني عند بدء البث',
    fallback: '',
  },
  rec: {
    title: 'راجع الدرس',
    body: 'يُنشر تسجيل الدرس بعد انتهائه، فتستمع إليه مرة أخرى وتعلّم عليه «راجعتُه».',
    switches: 'نبّهني عند نشر التسجيل',
    fallback: 'يُتاح التسجيل بعد نشره على موقع الشيخ',
  },
  prep: {
    title: 'حضّر للدرس القادم',
    body: 'اقرأ المقطع القادم في الكتاب قبل الدرس، وعلّم عليه «قرأتُه».',
    switches: 'ذكّرني بالتحضير',
    fallback: 'يظهر هنا مقطع الدرس القادم عند جدولته',
  },
};

function Pick({ course: c, all, on, onToggle }: { course: CourseDTO; all: CourseDTO[]; on: boolean; onToggle: () => void }) {
  const label = courseLabel(c, all);
  return (
    <button type="button" role="checkbox" aria-checked={on} class={on ? 'pick on' : 'pick'} onClick={onToggle}>
      <span class="box">{on && <Icon id="i-check" />}</span>
      <span class="t">
        <b>
          <Icon id={c.slot === 'fajr' ? 'i-sun' : 'i-moon'} class="slot" />
          {label}
        </b>
        {label !== c.title && <span class="b">{c.title}</span>}
        <span class="m">
          بعد {slotName(c.slot)} · {schedule(c.weekdays)} · نحو {clock12(c.time)}
        </span>
      </span>
    </button>
  );
}

const Dots = ({ at }: { at: number }) => (
  <div class="dots" aria-label={`الخطوة ${ar(at + 1)} من ${ar(STEPS.length)}`}>
    {STEPS.map((_, i) => (
      <i class={i === at ? 'on' : ''} />
    ))}
  </div>
);

export interface OnboardingProps {
  state: StateDTO | null;
  prefs: Prefs | null;
  now: Date;
  replay: boolean;
  onDone: (prefs: Prefs) => void;
  onLeave: () => void;
  // App's back-button handler calls this while the onboarding is up.
  backRef: { current: (() => void) | null };
}

export function Onboarding({ state, prefs, now, replay, onDone, onLeave, backRef }: OnboardingProps) {
  const native = nativeUI();
  const [at, setAt] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [asked, setAsked] = useState(false);
  const [permission, setPermission] = useState('granted');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (native) void pushPermission().then(setPermission);
  }, []);
  // The fresh course list can bring a new book after the cached one was shown: start again from the reconciled choices.
  const courseIds = state?.courses.map((c) => c.id).join(',');
  useEffect(() => {
    if (state && (!draft || at === 0)) setDraft(initialDraft(prefs, state.courses));
  }, [courseIds]);

  const back = () => (at > 0 ? setAt(at - 1) : replay ? onLeave() : undefined);
  backRef.current = back;
  useEffect(() => () => void (backRef.current = null), []);

  if (!state || !draft) {
    return (
      <div class="choose">
        <div class="booker">
          <p class="quiet">نحتاج اتصالًا بالإنترنت لعرض الدروس</p>
          <button class="chip" onClick={() => void refresh()}>
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  const courses = state.courses;
  const step = STEPS[at];
  const picked = pickedCourses(draft, courses);
  const last = at === STEPS.length - 1;

  const go = async () => {
    if (busy) return;
    if (native && asksPermission(step, draft, picked, asked, permission)) {
      setBusy(true);
      setAsked(true);
      setPermission(await askPermission());
      setBusy(false);
    }
    if (last) onDone(finalPrefs(draft, courses, prefs));
    else setAt(at + 1);
  };

  const top = (
    <div class="obtop">
      <Dots at={at} />
      {(at > 0 || replay) && (
        <button type="button" class="chip plain" onClick={back}>
          رجوع
        </button>
      )}
    </div>
  );

  if (step === 'app') {
    const none = courses.length > 0 && picked.length === 0;
    return (
      <div class="choose ob">
        {top}
        <div class="intro">
          <small>دروس الشيخ عبد الرزاق البدر في المسجد النبوي</small>
          <h3>أيَّ الدروس تحضر؟</h3>
          <p>تابع الدرس مباشرةً، وراجعه بعد نشر تسجيله، وحضّر للدرس القادم.</p>
        </div>
        <div class="picks">
          {courses.map((c) => (
            <Pick key={c.id} course={c} all={courses} on={draft.picked.includes(c.id)} onToggle={() => setDraft(pick(draft, c.id, !draft.picked.includes(c.id)))} />
          ))}
        </div>
        {courses.length === 0 && <p class="quiet">لا توجد دروس حاليًا، وسيظهر لك كل درس جديد هنا.</p>}
        <button class="chip pri wide" disabled={none} onClick={() => void go()}>
          {none ? 'اختر درسًا واحدًا على الأقل' : 'متابعة'}
        </button>
      </div>
    );
  }

  const text = TEXT[step];
  const card = cardFor(step, picked, state.live);
  const on = stepOn(step, draft, picked);
  const hint = stepHint(step, picked, courses);
  return (
    <div class="choose ob">
      {top}
      <div class="intro">
        <h3>{text.title}</h3>
        <p>{text.body}</p>
      </div>
      {card ? <Preview card={card} state={state} now={now} /> : text.fallback && <p class="quiet">{text.fallback}</p>}
      {native && hasSwitch(step, picked) && (
        <section class="notifs">
          <div class="card">
            <Toggle label={text.switches} hint={hint || undefined} on={on} onToggle={() => setDraft(setStep(draft, step, picked, !on))} />
          </div>
        </section>
      )}
      {native && permission === 'denied' && <p class="quiet">التنبيهات متوقفة من إعدادات الجهاز، وستعمل اختياراتك عند تفعيلها.</p>}
      <button class="chip pri wide" disabled={busy} onClick={() => void go()}>
        {last ? 'ابدأ' : 'متابعة'}
      </button>
    </div>
  );
}
