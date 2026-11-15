import type { CourseDTO, LiveDTO } from '@sualruhaily/shared';
import { liveContext, liveLesson } from '../logic/live';
import { ar, slotName } from './format';
import { Disc, Icon } from './Star';

export function LiveHero(p: { course: CourseDTO | undefined; live: LiveDTO; listening: boolean; onLive: () => void }) {
  const c = p.course;
  const ctx = c ? liveContext(c, true, p.live.startedAt) : null;
  const number = c ? liveLesson(c, p.live.startedAt).number : null;
  return (
    <div class="hero">
      <span class="tag live">
        <i class="dot" />
        {c ? `مباشر الآن · درس ${slotName(c.slot)}` : 'مباشر الآن'}
      </span>
      <Disc icon="play" label="استمع إلى البث المباشر" onClick={p.onLive} live={p.listening ? 'still' : 'pulse'} />
      <h3>{c ? c.title : 'البث المباشر'}</h3>
      {number !== null && (
        <p>
          الدرس {ar(number)}
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

export function LiveCard(p: { course: CourseDTO; live: LiveDTO; onLive: () => void }) {
  const number = liveLesson(p.course, p.live.startedAt).number;
  return (
    <div class="card livecard">
      <i class="dot" />
      <div class="t">
        <span class="b">درس {slotName(p.course.slot)} مباشر الآن</span>
        <span class="m">
          {p.course.title} · الدرس {ar(number)}
        </span>
      </div>
      <button class="pill live" onClick={p.onLive}>
        استمع
      </button>
    </div>
  );
}
