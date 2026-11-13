import type { CourseDTO, LessonDTO, NextPassageDTO } from '@albadr/shared';
import { ar, arText, bookHref, bookLabel, editionPage, passageLine, printedPage } from './format';
import { Icon, Tick } from './Star';

export function BookChip({ course, pdfIndex, page, label, marker }: { course: CourseDTO; pdfIndex: number | null; page: number | null; label: string; marker?: boolean }) {
  const href = bookHref(course, pdfIndex, page, marker);
  if (href) {
    return (
      <a class={marker ? 'chip pri' : 'chip'} href={href}>
        <Icon id="i-pdf" />
        {bookLabel(label, printedPage(course, pdfIndex, page))}
      </a>
    );
  }
  const edition = editionPage(course, page);
  return edition ? <span class="pill o">{edition}</span> : null;
}

export function NextCard(p: { course: CourseDTO; next: NextPassageDTO; when: string; read: boolean; onTick: () => void }) {
  const { course, next } = p;
  return (
    <div class="card reach">
      <span class="k">
        الدرس {ar(next.number)} · {p.when}
      </span>
      <span class="b">{passageLine(course, next)}</span>
      <div class="acts start">
        <BookChip course={course} pdfIndex={next.pdfIndex} page={next.startPage} label="اقرأ في الكتاب" marker />
        <Tick label="قرأتُه" done={p.read} onClick={p.onTick} />
      </div>
    </div>
  );
}

export function RecordingCard(p: { course: CourseDTO; lesson: LessonDTO; reviewed: boolean; onPlay: () => void; onTick: () => void }) {
  const { course, lesson } = p;
  return (
    <div class="card reach last">
      <span class="k">الدرس {ar(lesson.number)} · التسجيل متاح</span>
      <span class="b">{arText(lesson.startPoint)}</span>
      <div class="acts start">
        <button class="chip pri" onClick={p.onPlay}>
          <Icon id="play" class="fill" />
          استمع
        </button>
        <BookChip course={course} pdfIndex={lesson.pdfIndex} page={lesson.startPage} label="الكتاب" />
        <Tick label="راجعتُه" done={p.reviewed} onClick={p.onTick} />
      </div>
    </div>
  );
}
