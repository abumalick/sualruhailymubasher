import type { CourseDTO, LiveDTO } from '@albadr/shared';
import { useEffect } from 'preact/hooks';
import { player } from '../audio/player';
import { liveContext } from '../logic/live';
import { Icon } from './Star';

export interface LiveSheetProps {
  live: LiveDTO;
  course: CourseDTO | undefined;
  expanded: boolean;
  inBook?: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onClose: () => void;
}

// The iframe stays the first child in both states: moving or re-inserting it reloads Mixlr and cuts the audio.
export function LiveSheet({ live, course, expanded, inBook = false, onExpand, onCollapse, onClose }: LiveSheetProps) {
  const ctx = liveContext(course, live.isLive);
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
              <span>{ctx.header}</span>
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
              {ctx.status.live && <i class="dot" />}
              {ctx.status.text}
            </span>
          </button>
          {!inBook && bookLink}
          <button class="x" aria-label="إيقاف البث" onClick={onClose}>
            <Icon id="i-pause" />
          </button>
        </div>
      )}
    </div>
  );
}
