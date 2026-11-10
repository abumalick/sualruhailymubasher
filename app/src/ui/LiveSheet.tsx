import type { CourseDTO, LiveDTO } from '@albadr/shared';
import { useEffect, useState } from 'preact/hooks';
import { player } from '../audio/player';
import { liveContext } from '../logic/live';
import { Icon } from './Star';

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
  useEffect(() => {
    player.startEmbed(ctx.title, onClose);
    return () => player.endEmbed();
  }, []);
  const bookLink = (short: boolean) =>
    ctx.book && (
      <a class="chip" href={ctx.book} aria-label={ctx.bookLabel} onClick={onCollapse}>
        <Icon id="i-pdf" />
        {short ? 'تابع في الكتاب' : ctx.bookLabel}
      </a>
    );
  const stop = (
    <button class="x" aria-label="إيقاف البث" onClick={onClose}>
      <Icon id="i-pause" />
    </button>
  );
  return (
    <div class={expanded ? 'sheet' : 'sheet min'} role={expanded ? 'dialog' : 'region'} aria-label="البث المباشر">
      {expanded ? (
        <div class="lhead">
          <div class="bar">
            <button class="back" aria-label="تصغير" onClick={onCollapse}>
              <Icon id="i-back" />
            </button>
            <div class="t">
              <b>{ctx.title}</b>
              <span aria-live="polite">{ctx.status.live ? ctx.header : `${ctx.header} · ${ctx.status.text}`}</span>
            </div>
            {stop}
          </div>
          {ctx.start && (
            <div class="lstart">
              <span class="k">يبدأ الدرس من</span>
              <p>{ctx.start}</p>
              {(ctx.edition || ctx.book) && <div class="acts start">{ctx.edition ? <span class="pill o">{ctx.edition}</span> : bookLink(false)}</div>}
            </div>
          )}
          <div class="lreload">
            <span>توقّف البث أو لم يظهر؟</span>
            <button class="chip" onClick={() => setLoads((n) => n + 1)}>
              <Icon id="i-rev" />
              إعادة تحميل البث
            </button>
          </div>
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
          {!inBook && bookLink(true)}
          {stop}
        </div>
      )}
      <iframe key={loads} src={live.embedUrl} allow="autoplay" title="البث المباشر" />
    </div>
  );
}
