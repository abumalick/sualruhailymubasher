import type { CourseDTO, LessonDTO, LiveDTO } from '@sualruhaily/shared';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { fetchLessons } from '../api';
import { buildLesson } from '../logic/lesson';
import type { TickKind, Ticks } from '../logic/ticks';
import { hijriLabel } from '../logic/time';
import { ar, arText, bookHref, clock12, dayWord, pageSuffix, printedPage, schedule, slotName } from './format';
import { NextCard, RecordingCard } from './cards';
import { LiveCard, LiveHero } from './LiveHero';
import { Icon, Tick } from './Star';

const PAGE = 20;

export interface LessonProps {
  course: CourseDTO;
  live: LiveDTO;
  otherLive: { course: CourseDTO | null } | null;
  ticks: Ticks;
  now: Date;
  listening: boolean;
  notice?: ComponentChildren;
  onTick: (kind: TickKind, courseId: string, n: number) => void;
  onPlay: (lesson: LessonDTO, course: CourseDTO) => void;
  onLive: () => void;
}

function merge(a: LessonDTO[], b: LessonDTO[]): LessonDTO[] {
  const byNumber = new Map<number, LessonDTO>();
  for (const l of [...b, ...a]) byNumber.set(l.number, l);
  return [...byNumber.values()].sort((x, y) => y.number - x.number);
}

function useArchive(course: CourseDTO) {
  const [older, setOlder] = useState<LessonDTO[]>([]);
  const [more, setMore] = useState(course.latest.length > 0);
  const [failed, setFailed] = useState(false);
  const loading = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const lessons = merge(course.latest, older);
  const oldest = lessons.at(-1)?.number;

  async function loadMore() {
    if (loading.current || oldest === undefined) return;
    loading.current = true;
    try {
      const page = await fetchLessons(course.id, oldest);
      setOlder((o) => [...o, ...page]);
      if (page.length < PAGE) setMore(false);
    } catch {
      setFailed(true);
    } finally {
      loading.current = false;
    }
  }

  useEffect(() => {
    if (!more || failed || !sentinel.current || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore();
    });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [oldest, more, failed]);

  return { lessons, failed, retry: () => setFailed(false), sentinel };
}

export const Sec = ({ title, hint }: { title: string; hint?: string }) => (
  <h2 class="sec lsec">
    {title}
    {hint && <small>· {hint}</small>}
  </h2>
);

export function LessonHead({ course, now }: { course: CourseDTO; now: Date }) {
  const slot = slotName(course.slot);
  const { weekday, day } = hijriLabel(now);
  return (
    <>
      <div class="lh">
        <span class="sym">
          <Icon id={course.slot === 'maghrib' ? 'i-moon' : 'i-sun'} />
        </span>
        <div class="t">
          <h1>درس {slot}</h1>
          <small>
            {schedule(course.weekdays)} · بعد صلاة {slot}
          </small>
        </div>
        <div class="date">
          {weekday}
          <br />
          {day}
        </div>
      </div>
      <p class="ct">{course.title}</p>
      {course.place && <p class="ct place">{course.place}</p>}
    </>
  );
}

export function Lesson(p: LessonProps) {
  const { course, ticks } = p;
  const model = buildLesson(course, p.live, ticks, p.now);
  const { lessons, failed, retry, sentinel } = useArchive(course);
  const archive = lessons.filter((l) => l.number !== model.archiveSkip);
  const slot = slotName(course.slot);
  const next = course.next;
  const latest = course.latest[0];
  const knownPage = next?.startPage ?? latest?.endPage ?? latest?.startPage ?? null;
  const { top, last } = model;

  return (
    <div class="lp" data-slot={course.slot}>
      {p.otherLive &&
        (p.otherLive.course ? (
          <LiveCard course={p.otherLive.course} live={p.live} onLive={p.onLive} />
        ) : (
          <LiveHero course={undefined} live={p.live} listening={p.listening} onLive={p.onLive} />
        ))}
      <LessonHead course={course} now={p.now} />
      {knownPage === null && course.pdfUrls.length > 1 && (
        <div class="acts start">
          {course.pdfUrls.map((_, i) => (
            <a class="chip" href={bookHref(course, i, null)!}>
              <Icon id="i-pdf" />
              الجزء {ar(i + 1)}
            </a>
          ))}
        </div>
      )}
      {p.notice}

      {top.kind === 'live' && <LiveHero course={course} live={p.live} listening={p.listening} onLive={p.onLive} />}
      {top.kind === 'next' && (
        <>
          <Sec title="الدرس القادم" hint="حضّره" />
          <NextCard course={course} next={top.next} read={top.read} when={`${dayWord(top.next.date, p.now)} بعد ${slot} · ${clock12(top.next.time)}`} onTick={() => p.onTick('read', course.id, top.next.number)} />
        </>
      )}
      {top.kind === 'today' && (
        <>
          <Sec title="درس اليوم" />
          <NextCard course={course} next={top.next} read={top.read} when={top.ended ? 'انتهى' : `بدأ ${clock12(top.next.time)}`} onTick={() => p.onTick('read', course.id, top.next.number)} />
        </>
      )}
      {top.kind === 'none' && <p class="quiet">لا يوجد درس قادم مجدول</p>}

      {last && (
        <>
          <Sec title="آخر درس" hint={last.kind === 'recording' ? 'راجعه' : undefined} />
          {last.kind === 'recording' ? (
            <RecordingCard
              course={course}
              lesson={last.lesson}
              reviewed={ticks.reviewed.has(`${course.id}:${last.lesson.number}`)}
              onPlay={() => p.onPlay(last.lesson, course)}
              onTick={() => p.onTick('reviewed', course.id, last.lesson.number)}
            />
          ) : (
            <div class="card reach last">
              <span class="b">التسجيل قريبًا · الدرس {ar(last.lessonNumber)}</span>
              <span class="m">يُتاح التسجيل بعد نشره على موقع الشيخ</span>
            </div>
          )}
        </>
      )}

      {archive.length > 0 && (
        <>
          <Sec title="كل الدروس" />
          <div class="card archive">
            {archive.map((l) => (
              <div class="lesson" key={l.number}>
                {l.recordingUrl ? (
                  <button class="mini" aria-label="استمع" onClick={() => p.onPlay(l, course)}>
                    <Icon id="play" />
                  </button>
                ) : (
                  <span class="mini dashed" aria-label="التسجيل غير متاح بعد">
                    <Icon id="i-rev" />
                  </span>
                )}
                <div class="t">
                  <span class="b">الدرس {ar(l.number)}</span>
                  <span class="m">
                    {arText(l.startPoint)}
                    {pageSuffix(printedPage(course, l.pdfIndex, l.startPage))}
                  </span>
                </div>
                <Tick label="راجعتُه" compact done={ticks.reviewed.has(`${course.id}:${l.number}`)} onClick={() => p.onTick('reviewed', course.id, l.number)} />
              </div>
            ))}
          </div>
        </>
      )}
      {failed && (
        <button class="chip retry" onClick={retry}>
          تعذّر التحميل · إعادة المحاولة
        </button>
      )}
      {lessons.length > 0 && <div ref={sentinel} class="sentinel" />}
    </div>
  );
}
