import type { CourseDTO, LessonDTO } from '@albadr/shared';
import { useEffect, useRef, useState } from 'preact/hooks';
import { fetchLessons } from '../api';
import type { TickKind, Ticks } from '../logic/ticks';
import { ar, arText, bookHref, clock12, schedule, slotName, weekdayOf } from './format';
import { Icon, Tick } from './Star';

const PAGE = 20;

interface Props {
  course: CourseDTO;
  ticks: Ticks;
  onTick: (kind: TickKind, courseId: string, n: number) => void;
  onPlay: (lesson: LessonDTO, course: CourseDTO) => void;
}

function merge(a: LessonDTO[], b: LessonDTO[]): LessonDTO[] {
  const byNumber = new Map<number, LessonDTO>();
  for (const l of [...b, ...a]) byNumber.set(l.number, l);
  return [...byNumber.values()].sort((x, y) => y.number - x.number);
}

export function Course({ course, ticks, onTick, onPlay }: Props) {
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

  const latest = course.latest[0];
  const next = course.next;
  const page = next?.startPage ?? latest?.endPage ?? latest?.startPage ?? null;
  const pdfIndex = next?.startPage != null ? next.pdfIndex : (latest?.endPdfIndex ?? latest?.pdfIndex ?? null);
  const book = bookHref(course, pdfIndex, page, next?.startPage != null);

  return (
    <>
      <div class="bar">
        <a class="back" href="#/courses" aria-label="رجوع">
          <Icon id="i-back" />
        </a>
        <div class="t">
          <b>{course.title}</b>
          <span>
            درس {slotName(course.slot)} · {schedule(course.weekdays)}
          </span>
        </div>
      </div>
      <div class="card reach">
        <div class="t">
          <span class="k">وصلنا إلى</span>
          <span class="b">{latest ? `الدرس ${ar(latest.number)} · ${arText(latest.startPoint)}` : 'لم يبدأ الدرس بعد'}</span>
        </div>
        {page !== null && (
          <span class="m">
            {course.pdfUrls.length > 1 && `الجزء ${ar((pdfIndex ?? 0) + 1)} · `}ص {ar(page)}
          </span>
        )}
        <span class="m">
          {next
            ? `الدرس القادم ${ar(next.number)} · ${weekdayOf(next.date)} ${clock12(next.time)}`
            : 'لا يوجد درس قادم مجدول'}
        </span>
        <div class="acts start">
          {book && page !== null && (
            <a class="chip pri" href={book}>
              <Icon id="i-pdf" />
              الكتاب · ص {ar(page)}
            </a>
          )}
          <a class="chip" href="#/notifications">
            <Icon id="i-bell" />
            التنبيهات
          </a>
        </div>
      </div>
      {lessons.length > 0 && (
        <>
          <p class="sec">التسجيلات</p>
          <div class="card">
            {lessons.map((l) => (
              <div class="lesson" key={l.number}>
                {l.recordingUrl ? (
                  <button class="mini" aria-label="استمع" onClick={() => onPlay(l, course)}>
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
                    {l.startPage !== null && ` · ص ${ar(l.startPage)}`}
                  </span>
                </div>
                <Tick
                  label="راجعتُه"
                  compact
                  done={ticks.reviewed.has(`${course.id}:${l.number}`)}
                  onClick={() => onTick('reviewed', course.id, l.number)}
                />
              </div>
            ))}
          </div>
          {failed && (
            <button class="chip retry" onClick={() => setFailed(false)}>
              تعذّر التحميل · إعادة المحاولة
            </button>
          )}
          <div ref={sentinel} class="sentinel" />
        </>
      )}
    </>
  );
}
