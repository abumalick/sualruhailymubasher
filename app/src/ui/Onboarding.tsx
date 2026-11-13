import type { CourseDTO, StateDTO } from '@albadr/shared';
import { useEffect, useState } from 'preact/hooks';
import { asksPermission, cardFor, finalPrefs, initialDraft, pick, pickedCourses, stepTopics, STEPS, type Card, type Draft, type Step } from '../logic/onboarding';
import type { Prefs } from '../logic/prefs';
import { nativeUI } from '../platform';
import { askPermission, pushPermission } from '../push';
import { refresh } from '../store';
import { NextCard, RecordingCard } from './cards';
import { ar, clock12, courseLabel, dayWord, REMINDER, schedule, slotName } from './format';
import { LiveHero } from './LiveHero';
import { Toggle } from './Notifications';
import { Icon } from './Star';

const noop = () => {};

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

// Off air, the hero is shown as it will look once this lesson starts: it then reads the next lesson from the course.
const onAir = (live: StateDTO['live'], course: CourseDTO) => (live.isLive && live.courseId === course.id ? live : { ...live, isLive: true, courseId: course.id, startedAt: null });

// A card shown as an example: it looks real but nothing in it can be tapped, focused or read twice by a screen reader.
function Example({ card, live, now }: { card: Card; live: StateDTO['live']; now: Date }) {
  const { course } = card;
  const slot = slotName(course.slot);
  const block = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <div class="frame" inert aria-hidden="true" onClickCapture={block}>
      <span class="flabel">مثال من درس {slot}</span>
      {card.kind === 'live' && <LiveHero course={course} live={onAir(live, course)} listening={false} onLive={noop} />}
      {card.kind === 'recording' && <RecordingCard course={course} lesson={card.lesson} reviewed={false} onPlay={noop} onTick={noop} />}
      {card.kind === 'next' && <NextCard course={course} next={card.next} read={false} when={`${dayWord(card.next.date, now)} بعد ${slot} · ${clock12(card.next.time)}`} onTick={noop} />}
    </div>
  );
}

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
  const toggle = (topic: string) =>
    setDraft({ ...draft, wanted: draft.wanted.includes(topic) ? draft.wanted.filter((t) => t !== topic) : [...draft.wanted, topic] });

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
  const rows = stepTopics(step, picked);
  const label = (courseId: string | null) => {
    const c = courses.find((x) => x.id === courseId);
    return c ? courseLabel(c, courses) : 'بث مباشر آخر';
  };
  return (
    <div class="choose ob">
      {top}
      <div class="intro">
        <h3>{text.title}</h3>
        <p>{text.body}</p>
      </div>
      {card ? <Example card={card} live={state.live} now={now} /> : text.fallback && <p class="quiet">{text.fallback}</p>}
      {native && rows.length > 0 && (
        <section class="notifs">
          <p class="sec">{text.switches}</p>
          <div class="card">
            {rows.map((r) => {
              const c = courses.find((x) => x.id === r.courseId);
              return <Toggle key={r.topic} label={label(r.courseId)} hint={step === 'prep' && c ? REMINDER[c.slot] : undefined} on={draft.wanted.includes(r.topic)} onToggle={() => toggle(r.topic)} />;
            })}
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
