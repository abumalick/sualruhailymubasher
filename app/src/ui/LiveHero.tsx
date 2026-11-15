import type { CourseDTO, LiveDTO } from '@sualruhaily/shared';
import { liveContext, liveLabel } from '../logic/live';
import { slotName } from './format';
import { Disc, Icon } from './Star';

export function LiveHero(p: { course: CourseDTO | undefined; live: LiveDTO; listening: boolean; onLive: () => void }) {
  const c = p.course;
  const ctx = c ? liveContext(c, true, p.live.startedAt) : null;
  const label = c ? liveLabel(c, p.live.startedAt) : null;
  return (
    <div class="hero">
      <span class="tag live">
        <i class="dot" />
        {c ? `مباشر الآن · درس ${slotName(c.slot)}` : 'مباشر الآن'}
      </span>
      <Disc icon="play" label="استمع إلى البث المباشر" onClick={p.onLive} live={p.listening ? 'still' : 'pulse'} />
      <h3>{c ? c.title : 'البث المباشر'}</h3>
      {(label !== null || ctx?.start) && <p>{[label, ctx?.start].filter(Boolean).join(' · ')}</p>}
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

export function LiveCard(p: { course: CourseDTO; live: LiveDTO; onLive: () => void }) {
  const label = liveLabel(p.course, p.live.startedAt);
  return (
    <div class="card livecard">
      <i class="dot" />
      <div class="t">
        <span class="b">درس {slotName(p.course.slot)} مباشر الآن</span>
        <span class="m">
          {label === null ? p.course.title : `${p.course.title} · ${label}`}
        </span>
      </div>
      <button class="pill live" onClick={p.onLive}>
        استمع
      </button>
    </div>
  );
}
