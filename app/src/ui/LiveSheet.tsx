import type { CourseDTO, LiveDTO } from '@albadr/shared';
import { useEffect } from 'preact/hooks';
import { player } from '../audio/player';
import { liveLessonNumber } from '../logic/home';
import { ar, arText, bookHref, editionPage } from './format';
import { Icon } from './Star';

export interface LiveSheetProps {
  live: LiveDTO;
  course: CourseDTO | undefined;
  expanded: boolean;
  onBook?: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onClose: () => void;
}

export function liveContext(course: CourseDTO | undefined) {
  const next = course?.next ?? null;
  return {
    title: course?.title ?? 'البث المباشر',
    lesson: course ? `الدرس ${ar(liveLessonNumber(course))}` : null,
    start: next ? (next.startPoint ? arText(next.startPoint) : `يتابع من حيث توقف الدرس ${ar(next.number - 1)}`) : null,
    edition: course && next ? editionPage(course, next.startPage) : null,
    book: course && next ? bookHref(course, next.pdfIndex, next.startPage, true) : null,
    bookLabel: next?.startPage != null ? `تابع في الكتاب · ص ${ar(next.startPage)}` : 'تابع في الكتاب',
  };
}

// The iframe stays the first child in both states: moving or re-inserting it reloads Mixlr and cuts the audio.
export function LiveSheet({ live, course, expanded, onBook = false, onExpand, onCollapse, onClose }: LiveSheetProps) {
  const ctx = liveContext(course);
  useEffect(() => {
    player.startEmbed(ctx.title, onClose);
    return () => player.endEmbed();
  }, []);
  const bookLink = ctx.book && (
    <a class="chip" href={ctx.book} onClick={onCollapse}>
      <Icon id="i-pdf" />
      {ctx.bookLabel}
    </a>
  );
  return (
    <div class={expanded ? 'sheet' : 'sheet min'} role={expanded ? 'dialog' : 'region'} aria-label="البث المباشر">
      <iframe src={live.embedUrl} allow="autoplay" title="البث المباشر" />
      {expanded ? (
        <div class="lhead">
          <div class="bar">
            <button class="back" aria-label="تصغير" onClick={onCollapse}>
              <Icon id="i-back" />
            </button>
            <div class="t">
              <b>{ctx.title}</b>
              <span>{ctx.lesson ? `البث المباشر · ${ctx.lesson}` : 'البث المباشر'}</span>
            </div>
          </div>
          {ctx.start && (
            <div class="lstart">
              <span class="k">يبدأ الدرس من</span>
              <p>{ctx.start}</p>
              {(ctx.edition || bookLink) && <div class="acts start">{ctx.edition ? <span class="pill o">{ctx.edition}</span> : bookLink}</div>}
            </div>
          )}
        </div>
      ) : (
        <div class="lbar">
          <button class="t" aria-label="عرض البث المباشر" onClick={onExpand}>
            <span class="b">{ctx.title}</span>
            <span class="m">
              <i class="dot" />
              {ctx.lesson ? `مباشر · ${ctx.lesson}` : 'بث مباشر'}
              {ctx.edition && ` · ${ctx.edition}`}
            </span>
          </button>
          {!onBook && bookLink}
          <button class="x" aria-label="إيقاف البث" onClick={onClose}>
            <Icon id="i-pause" />
          </button>
        </div>
      )}
    </div>
  );
}
