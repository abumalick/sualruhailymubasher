import type { CourseDTO, LiveDTO } from '@albadr/shared';
import { useEffect, useRef, useState } from 'preact/hooks';
import { player } from '../audio/player';
import { liveContext, type LiveContext } from '../logic/live';
import { Icon } from './Star';

export const SLIDE_MS = 220;

export interface LiveSheetProps {
  live: LiveDTO;
  course: CourseDTO | undefined;
  startedAt: string | null;
  expanded: boolean;
  inBook?: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onClose: () => void;
}

// The sheet always has exactly two children, the header/bar div then the iframe, and only their contents and
// classes change: moving or re-inserting the iframe reloads Mixlr and cuts the audio. Only the reload button
// re-inserts it on purpose, by changing its key, when the Mixlr page gets stuck.
export function LiveSheet({ live, course, startedAt, expanded, inBook = false, onExpand, onCollapse, onClose }: LiveSheetProps) {
  const ctx = liveContext(course, live.isLive, startedAt);
  const [loads, setLoads] = useState(0);
  const [sliding, setSliding] = useState(false);
  const slide = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    player.startEmbed(ctx.title, onClose);
    return () => {
      clearTimeout(slide.current);
      player.endEmbed();
    };
  }, []);
  useEffect(() => {
    clearTimeout(slide.current);
    setSliding(false);
  }, [expanded]);
  const minimize = () => {
    if (sliding) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return onCollapse();
    setSliding(true);
    slide.current = setTimeout(() => {
      setSliding(false);
      onCollapse();
    }, SLIDE_MS);
  };
  return (
    <div class={!expanded ? 'sheet min' : sliding ? 'sheet down' : 'sheet'} role={expanded ? 'dialog' : 'region'} aria-label="البث المباشر">
      {expanded ? (
        <div class="lhead">
          <LiveHead ctx={ctx} onMinimize={minimize} onReload={() => setLoads((n) => n + 1)} onCollapse={onCollapse} onClose={onClose} />
        </div>
      ) : (
        <div class="lbar">
          <button class="t" onClick={onExpand}>
            <span class="b">{ctx.title}</span>
            <span class="m" aria-live="polite">
              {ctx.status.live && <i class="dot" />}
              {ctx.status.text}
            </span>
          </button>
          {!inBook && <BookLink ctx={ctx} short onCollapse={onCollapse} />}
          <Stop onClose={onClose} />
        </div>
      )}
      <iframe key={loads} src={live.embedUrl} allow="autoplay" title="البث المباشر" />
    </div>
  );
}

const BookLink = ({ ctx, short, onCollapse }: { ctx: LiveContext; short?: boolean; onCollapse: () => void }) =>
  ctx.book && (
    <a class="chip" href={ctx.book} aria-label={ctx.bookLabel} onClick={onCollapse}>
      <Icon id="i-pdf" />
      <span>{short ? 'تابع في الكتاب' : ctx.bookLabel}</span>
    </a>
  );

const Stop = ({ onClose }: { onClose: () => void }) => (
  <button class="x" aria-label="إيقاف البث" onClick={onClose}>
    <Icon id="i-stop" />
  </button>
);

// The open player's header, inside its .lhead: what is on air and where the lesson starts in the book.
export function LiveHead({ ctx, onMinimize, onReload, onCollapse, onClose }: { ctx: LiveContext; onMinimize: () => void; onReload: () => void; onCollapse: () => void; onClose: () => void }) {
  return (
    <>
      <div class="bar">
        <button class="back" aria-label="تصغير" onClick={onMinimize}>
          <Icon id="i-down" />
        </button>
        <div class="t">
          <b>{ctx.title}</b>
          <span aria-live="polite">{ctx.status.live ? ctx.header : `${ctx.header} · ${ctx.status.text}`}</span>
        </div>
        <button class="rl" aria-label="إعادة تحميل البث" onClick={onReload}>
          <Icon id="i-rev" />
        </button>
        <Stop onClose={onClose} />
      </div>
      {ctx.start && (
        <div class="lstart">
          <span class="k">يبدأ الدرس من</span>
          <p>{ctx.start}</p>
          {(ctx.edition || ctx.book) && (
            <div class="acts start">
              {ctx.edition ? <span class="pill o">{ctx.edition}</span> : <BookLink ctx={ctx} onCollapse={onCollapse} />}
            </div>
          )}
        </div>
      )}
    </>
  );
}
