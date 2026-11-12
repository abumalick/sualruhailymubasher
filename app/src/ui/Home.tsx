import type { CourseDTO, LessonDTO, StateDTO } from '@albadr/shared';
import type { ComponentChildren } from 'preact';
import { buildHome, type HomeModel, type Item } from '../logic/home';
import { liveContext } from '../logic/live';
import type { TickKind, Ticks } from '../logic/ticks';
import { hijriLabel } from '../logic/time';
import { ar, arText, bookHref, bookLabel, clock12, dayWord, editionPage, pageSuffix, passageLine, printedPage, slotName, weekdayOf } from './format';
import { Disc, Icon, Tick } from './Star';

export interface HomeProps {
  state: StateDTO | null;
  ticks: Ticks;
  now: Date;
  error: boolean;
  onTick: (kind: TickKind, courseId: string, n: number) => void;
  onPlay: (lesson: LessonDTO, course: CourseDTO) => void;
  onLive: () => void;
  listening?: boolean;
  onRetry?: () => void;
  notice?: ComponentChildren;
}

type Of<K extends Item['kind']> = Extract<Item, { kind: K }>;

export function Home(p: HomeProps) {
  const model = p.state ? buildHome(p.state, p.ticks, p.now) : null;
  const { weekday, day } = hijriLabel(p.now);
  return (
    <>
      <div class="head">
        <div class="name">
          <h2>عبد الرزاق البدر</h2>
          <small>الدروس العلمية · المدينة النبوية</small>
        </div>
        <div class="date">
          {weekday}
          <br />
          {day}
        </div>
      </div>
      {p.notice}
      {p.error && <p class="err">تعذّر التحديث</p>}
      {p.error && !p.state && p.onRetry && (
        <button class="chip retry" onClick={p.onRetry}>
          إعادة المحاولة
        </button>
      )}
      {p.state && model && <Body {...p} state={p.state} model={model} />}
    </>
  );
}

function Body(p: HomeProps & { state: StateDTO; model: HomeModel }) {
  const { model } = p;
  const course = (id: string) => p.state.courses.find((c) => c.id === id)!;
  const of = <K extends Item['kind']>(kind: K) => model.cards.filter((i): i is Of<K> => i.kind === kind);
  const reviews = of('review');
  const prepares = of('prepare');
  const awaiting = of('awaiting-recording');

  return (
    <>
      {model.hero ? <Hero {...p} item={model.hero} course={course} /> : <p class="quiet">لا توجد دروس حالية</p>}
      {model.steps && (
        <div class="cycle">
          <Step label="تحضير" state={model.steps.prepare} />
          <span class="sep" />
          <Step label="الدرس" state={model.steps.lesson} />
          <span class="sep" />
          <Step label="مراجعة" state={model.steps.review} />
        </div>
      )}
      {reviews.length > 0 && (
        <Section title={reviews.some((r) => !r.done) ? 'لم تراجعه بعد' : 'التسجيلات المتاحة'}>
          {reviews.map((r) => {
            const c = course(r.courseId);
            const play = () => p.onPlay(r.lesson, c);
            return (
              <div class="lesson">
                <button class="mini" aria-label="استمع" onClick={play}>
                  <Icon id="play" />
                </button>
                <div class="t">
                  <span class="b">
                    درس {slotName(c.slot)} · الدرس {ar(r.lesson.number)}
                  </span>
                  <span class="m">
                    {arText(r.lesson.startPoint)}
                    {pageSuffix(printedPage(c, r.lesson.pdfIndex, r.lesson.startPage))}
                  </span>
                </div>
                {r.done ? (
                  <Tick label="راجعتُه" done compact onClick={() => p.onTick('reviewed', c.id, r.lesson.number)} />
                ) : (
                  <button class="pill o" onClick={play}>
                    راجِع
                  </button>
                )}
              </div>
            );
          })}
        </Section>
      )}
      {prepares.length > 0 && (
        <Section title="حضّر الدرس القادم">
          {prepares.map((i) => {
            const c = course(i.courseId);
            const href = bookHref(c, i.next.pdfIndex, i.next.startPage, true) ?? `#/course/${c.id}`;
            return (
              <div class="lesson">
                <a class="mini dashed" href={href} aria-label="اقرأ في الكتاب">
                  <Icon id="i-pdf" />
                </a>
                <div class="t">
                  <span class="b">{passageLine(c, i.next)}</span>
                  <span class="m">
                    درس {weekdayOf(i.next.date)} بعد {slotName(c.slot)}
                    {pageSuffix(printedPage(c, i.next.pdfIndex, i.next.startPage))}
                  </span>
                </div>
                <Tick label="قرأتُه" done={i.done} compact onClick={() => p.onTick('read', c.id, i.next.number)} />
              </div>
            );
          })}
        </Section>
      )}
      {awaiting.length > 0 && (
        <Section title="بانتظار التسجيل">
          {awaiting.map((i) => (
            <div class="lesson">
              <span class="mini dashed">
                <Icon id="i-rev" />
              </span>
              <div class="t">
                <span class="b">
                  درس {slotName(course(i.courseId).slot)} · الدرس {ar(i.lessonNumber)}
                </span>
                <span class="m">يُتاح التسجيل بعد نشره على موقع الشيخ</span>
              </div>
            </div>
          ))}
        </Section>
      )}
      {model.today.length > 0 && (
        <Section title="دروس اليوم">
          {model.today.map((t) => {
            const c = course(t.courseId);
            const title = (
              <div class="t">
                <span class="k">بعد {slotName(c.slot)}</span>
                <span class="b">{c.title}</span>
              </div>
            );
            return t.status === 'live' ? (
              <button class="lesson" onClick={p.onLive}>
                {title}
                <span class="pill live">مباشر</span>
              </button>
            ) : (
              <a class="lesson" href={`#/course/${c.id}`}>
                {title}
                <span class="pill o">{t.status === 'done' ? 'انتهى' : clock12(t.time)}</span>
              </a>
            );
          })}
        </Section>
      )}
    </>
  );
}

function Hero(p: HomeProps & { state: StateDTO; item: Item; course: (id: string) => CourseDTO }) {
  const { item } = p;
  if (item.kind === 'live') {
    const c = item.courseId ? p.state.courses.find((x) => x.id === item.courseId) : undefined;
    const ctx = c ? liveContext(c, true, p.state.live.startedAt) : null;
    return (
      <div class="hero">
        <span class="tag live">
          <i class="dot" />
          {c ? `مباشر الآن · درس ${slotName(c.slot)}` : 'مباشر الآن'}
        </span>
        <Disc icon="play" label="استمع إلى البث المباشر" onClick={p.onLive} live={p.listening ? 'still' : 'pulse'} />
        <h3>{c ? c.title : 'البث المباشر'}</h3>
        {c && item.lessonNumber !== null && (
          <p>
            الدرس {ar(item.lessonNumber)}
            {ctx?.start && ` · ${ctx.start}`}
          </p>
        )}
        <button class="go-live" onClick={p.onLive}>
          <Icon id="play" />
          {p.listening ? 'تستمع الآن إلى البث' : 'استمع إلى البث المباشر'}
        </button>
        {ctx?.edition && (
          <div class="acts">
            <span class="pill o">{ctx.edition}</span>
          </div>
        )}
        {ctx?.book && (
          <div class="acts">
            <a class="chip" href={ctx.book}>
              <Icon id="i-pdf" />
              {ctx.bookLabel}
            </a>
          </div>
        )}
      </div>
    );
  }

  const c = p.course(item.courseId);
  const slot = slotName(c.slot);

  if (item.kind === 'prepare') {
    const book = bookHref(c, item.next.pdfIndex, item.next.startPage, true);
    return (
      <div class="hero">
        <Disc icon="i-book" label="اقرأ في الكتاب" onClick={book ? () => (location.hash = book) : undefined} />
        <span class="tag step">
          حضّر لدرس {slot} {dayWord(item.next.date, p.now)}
        </span>
        <h3>{c.title}</h3>
        <p>{passageLine(c, item.next)}</p>
        <div class="acts">
          {!book && editionPage(c, item.next.startPage) && <span class="pill o">{editionPage(c, item.next.startPage)}</span>}
          {book && (
            <a class="chip pri" href={book}>
              <Icon id="i-pdf" />
              {bookLabel('اقرأ في الكتاب', printedPage(c, item.next.pdfIndex, item.next.startPage))}
            </a>
          )}
          <Tick label="قرأتُه" done={item.done} onClick={() => p.onTick('read', c.id, item.next.number)} />
        </div>
      </div>
    );
  }

  if (item.kind === 'review') {
    const { lesson } = item;
    const book = bookHref(c, lesson.pdfIndex, lesson.startPage);
    const play = () => p.onPlay(lesson, c);
    return (
      <div class="hero">
        <Disc icon="i-rev" label="استمع إلى التسجيل" onClick={play} />
        <span class="tag step">راجع درس {slot} · التسجيل متاح</span>
        <h3>
          {c.title} · الدرس {ar(lesson.number)}
        </h3>
        <p>{arText(lesson.startPoint)}</p>
        <div class="acts">
          <button class="chip pri" onClick={play}>
            <Icon id="play" class="fill" />
            استمع
          </button>
          {!book && editionPage(c, lesson.startPage) && <span class="pill o">{editionPage(c, lesson.startPage)}</span>}
          {book && (
            <a class="chip" href={book}>
              <Icon id="i-pdf" />
              {bookLabel('الكتاب', printedPage(c, lesson.pdfIndex, lesson.startPage))}
            </a>
          )}
          <Tick label="راجعتُه" done={item.done} onClick={() => p.onTick('reviewed', c.id, lesson.number)} />
        </div>
      </div>
    );
  }

  return (
    <div class="hero">
      <Disc icon="i-rev" label="التسجيل قريبًا" />
      <span class="tag step">التسجيل قريبًا · درس {slot}</span>
      <h3>
        {c.title} · الدرس {ar(item.lessonNumber)}
      </h3>
      <p>يُتاح التسجيل بعد نشره على موقع الشيخ</p>
    </div>
  );
}

function Step({ label, state }: { label: string; state: 'done' | 'current' | 'todo' }) {
  return <i class={state === 'done' ? 'ok' : state === 'current' ? 'on' : undefined}>{label}</i>;
}

function Section({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <>
      <p class="sec">{title}</p>
      <div class="card">{children}</div>
    </>
  );
}
