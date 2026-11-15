import type { StateDTO } from '@sualruhaily/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { bookBack, liveContext } from '../logic/live';
import type { Card } from '../logic/onboarding';
import { PHONE_HEIGHT, phonePan, PREVIEW_DURATION, previewAt, previewDestination, previewGeometry, previewNotice, previewPlay, STATUS_BAR, type Destination, type Frame, type Play, type Variant } from '../logic/preview';
import { BookBar, BookFoot } from './Book';
import { NextCard, RecordingCard } from './cards';
import { ar, arText, clock12, dayWord, passageRange, printedPage, slotName } from './format';
import { LessonHead, Sec } from './Lesson';
import { LiveHero } from './LiveHero';
import { LiveHead } from './LiveSheet';
import { PlayerBar } from './MiniPlayer';
import { Icon } from './Star';

const noop = () => {};

const SPOKEN: Record<Exclude<Play, 'stream'>, string> = {
  live: 'صورة توضيحية: يصلك تنبيه عند بدء البث، فيفتح مشغّل البث المباشر، وتضغط زر التشغيل فتستمع.',
  review: 'صورة توضيحية: يصلك تنبيه عند نشر التسجيل، فيفتح الدرس، فتستمع إلى التسجيل ثم تعلّم عليه «راجعتُه».',
  book: 'صورة توضيحية: يصلك تذكير قبل الدرس، فيفتح الكتاب على مقطع الدرس القادم، فتقرؤه ثم تعلّم عليه «قرأتُه».',
  page: 'صورة توضيحية: يصلك تذكير قبل الدرس، فيفتح صفحة الدرس على الدرس القادم.',
};

const WEB_SPOKEN: Record<Play, string> = {
  live: 'صورة توضيحية: تضغط زر البث المباشر في صفحة الدرس، فيفتح مشغّل البث، وتضغط زر التشغيل فتستمع.',
  stream: 'صورة توضيحية: تضغط زر البث المباشر في صفحة الدرس، فيبدأ البث في المشغّل أسفل الشاشة.',
  review: 'صورة توضيحية: في صفحة الدرس تستمع إلى تسجيل آخر درس، ثم تعلّم عليه «راجعتُه».',
  book: 'صورة توضيحية: في صفحة الدرس تفتح الكتاب على مقطع الدرس القادم، فتقرؤه ثم تعلّم عليه «قرأتُه».',
  page: 'صورة توضيحية: في صفحة الدرس يظهر الدرس القادم.',
};

const WEB_CAPTION: Record<Play, string> = {
  live: 'مثال: هكذا تستمع إلى البث',
  stream: 'مثال: هكذا تستمع إلى البث',
  review: 'مثال: هكذا تراجع الدرس',
  book: 'مثال: هكذا تحضّر للدرس',
  page: 'مثال: هكذا تحضّر للدرس',
};

const caption = (play: Play, variant: Variant) =>
  variant === 'web' ? WEB_CAPTION[play] : variant === 'invite' ? 'مثال: هكذا يصلك التنبيه في التطبيق' : 'مثال: هكذا يصلك التنبيه';
const spoken = (play: Play, variant: Variant) => (variant === 'web' || play === 'stream' ? WEB_SPOKEN[play] : SPOKEN[play]);

export function useReducedMotion(): boolean {
  const query = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const [reduced, setReduced] = useState(!!query?.matches);
  useEffect(() => {
    if (!query?.addEventListener) return;
    const change = () => setReduced(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return reduced;
}

// Re-renders at each beat until the preview rests; a new step starts it again.
function useFrame(play: Play, step: string, reduced: boolean, variant: Variant) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const now = Date.now() - start;
      setElapsed(now);
      const { wait } = previewAt(play, now, reduced, variant);
      if (wait !== null) timer = setTimeout(tick, wait);
    };
    tick();
    return () => clearTimeout(timer);
  }, [play, step, reduced, variant]);
  return previewAt(play, elapsed, reduced, variant).frame;
}

// The live player as it opens over the lesson. Mixlr's player is drawn as its embed looks on air, never loaded.
function LivePlayer({ card, state, playing }: { card: Card; state: StateDTO; playing: boolean }) {
  const startedAt = state.live.isLive && state.live.courseId === card.course.id ? state.live.startedAt : null;
  return (
    <div class="sheet">
      <div class="lhead">
        <LiveHead ctx={liveContext(card.course, true, startedAt)} onMinimize={noop} onReload={noop} onCollapse={noop} onClose={noop} />
      </div>
      <div class="pv-mixlr" data-playing={playing ? '' : undefined}>
        <div class="mx-top">
          <img src="/favicon.png" alt="" />
          <b>{MIXLR_CHANNEL}</b>
        </div>
        <div class="mx-mid">
          <img src="/favicon.png" alt="" />
          <b>{MIXLR_CHANNEL}</b>
          <span class="mx-live">
            <span>Live</span>
            <span>Event</span>
          </span>
        </div>
        <div class="mx-ctl">
          <i class="mx-wave">
            {WAVE.map((h, i) => (
              <i key={i} style={`--h:${h}`} />
            ))}
          </i>
          <span class="mx-side" />
          <span class="mx-play">
            <Icon id={playing ? 'i-stop' : 'play'} />
          </span>
          <span class="mx-side" />
        </div>
      </div>
    </div>
  );
}

const WAVE = [0.3, 0.55, 0.8, 0.45, 1, 0.6, 0.35, 0.7, 0.9, 0.4, 0.65, 0.25, 0.85, 0.5, 0.75, 0.3, 0.95, 0.55, 0.4, 0.8, 0.6, 0.35, 0.7, 0.45, 0.9, 0.3, 0.6, 0.5, 0.75, 0.4];

// The channel's name on Mixlr, as its embed shows it.
const MIXLR_CHANNEL = 'دروس سليمان الرحيلي';

// The book open at the next passage, «قرأتُه» in its footer; its page is drawn, never downloaded.
function BookPage({ card, to, read }: { card: Card; to: Extract<Destination, { kind: 'book' }>; read: boolean }) {
  const { course } = card;
  return (
    <div class="book pv-tickable">
      <BookBar course={course} range={to.marker ? passageRange(course, to.pdfIndex, to.page) : ''} shown={printedPage(course, to.pdfIndex, to.page)} back={bookBack(course.id)} />
      <div class="pdfwrap">
        <div class="pg pv-page">
          {to.marker && <span class="mkbanner">بداية الدرس تقريبًا</span>}
          {Array.from({ length: 30 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
      </div>
      <BookFoot tick={course.next ? { done: read, onTick: noop } : null} />
    </div>
  );
}

const INERT = { toggle: noop, skip: noop, seek: noop };

// The app's player bar, playing a direct live stream, as the web's live button starts it.
function StreamPlayer({ card, state, frame }: { card: Card; state: StateDTO; frame: Frame }) {
  if (!frame.playing) return null;
  const src = { url: state.live.streamUrl ?? '', title: card.course.title, subtitle: '', kind: 'live' as const, courseId: card.course.id };
  return <PlayerBar s={{ src, playing: true, position: 0, duration: 0, error: null }} act={INERT} />;
}

// The app's player bar, playing the recording to its end.
function RecordingPlayer({ card, frame }: { card: Card; frame: Frame }) {
  if (card.kind !== 'recording' || !(frame.playing || frame.ended)) return null;
  const { course, lesson } = card;
  const src = { url: lesson.recordingUrl ?? '', title: `${course.title} · الدرس ${ar(lesson.number)}`, subtitle: arText(lesson.startPoint), kind: 'recording' as const, courseId: course.id };
  return <PlayerBar s={{ src, playing: frame.playing, position: frame.ended ? PREVIEW_DURATION : 0, duration: PREVIEW_DURATION, error: null }} act={INERT} />;
}

// A picture of what the notification does: it looks real, plays by itself, and nothing in it can be tapped or focused.
export function Preview({ card, state, now, variant }: { card: Card; state: StateDTO; now: Date; variant: Variant }) {
  const { course } = card;
  const to = previewDestination(card, state, variant);
  const reduced = useReducedMotion();
  const play = previewPlay(card, to);
  const frame = useFrame(play, `${card.kind}:${course.id}`, reduced, variant);
  const web = variant === 'web';
  // On the web the live lesson page is drawn on air, the hero in place of the next lesson, as `Lesson` draws it.
  const onAir = web && card.kind === 'live';
  const notice = previewNotice(card, state.live);
  const panel = useRef<HTMLElement>(null);
  const [geo, setGeo] = useState<{ scale: number; bannerScale: number; pan: number } | null>(null);

  useLayoutEffect(() => {
    const el = panel.current!;
    const measure = () => {
      const { scale, bannerScale } = previewGeometry(el.clientWidth);
      const target = el.querySelector<HTMLElement>('.pv-target');
      // The hero is taller than the panel can show: the phone frames its disc, the one thing the finger taps.
      const disc = target?.querySelector<HTMLElement>('.disc');
      const screen = el.querySelector<HTMLElement>('.pv-screen');
      const targetBottom = disc && screen ? (disc.getBoundingClientRect().bottom - screen.getBoundingClientRect().top) / scale : target ? STATUS_BAR + target.offsetTop + target.offsetHeight : 0;
      const bottom = frame.focus === 'bottom' ? PHONE_HEIGHT : frame.focus === 'target' && target ? targetBottom + 12 : null;
      setGeo({ scale, bannerScale, pan: phonePan(el.clientHeight, scale, bottom) });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [course.id, card.kind, frame.focus]);

  const block = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const slot = slotName(course.slot);
  const latest = course.latest[0];
  const recording = card.kind === 'recording' ? card.lesson : latest?.recordingUrl ? latest : null;
  const onPage = (kind: Card['kind']) =>
    (to.kind === 'lesson' || (web && play === 'book')) && card.kind === kind ? (play === 'review' ? 'pv-target pv-tickable' : 'pv-target') : undefined;
  const style = geo ? `--s:${geo.scale};--bs:${geo.bannerScale};--pv-pan:${geo.pan}px` : undefined;
  return (
    <>
      <p class="sr">{spoken(play, variant)}</p>
      <figure
        ref={panel}
        class="pv"
        inert
        aria-hidden="true"
        onClickCapture={block}
        style={style}
        data-to={to.kind}
        data-banner={frame.banner}
        data-tap={frame.tap ?? undefined}
        data-focus={frame.focus}
        data-playing={frame.playing ? '' : undefined}
        data-spot={frame.spot ? '' : undefined}
        data-fade={frame.fade ? '' : undefined}
        data-still={frame.still ? '' : undefined}
      >
        <div class="pv-phone">
          <div class="pv-screen">
            <div class="pv-status">
              <span>٩:٤١</span>
              <i />
            </div>
            <div class="pv-app">
              <div class="lp pv-lp" data-slot={course.slot}>
                <LessonHead course={course} now={now} />
                {onAir && (
                  <div class="pv-target">
                    <LiveHero course={course} live={{ ...state.live, isLive: true, courseId: course.id }} listening={frame.playing} onLive={noop} />
                  </div>
                )}
                {course.next && !onAir && (
                  <>
                    <Sec title="الدرس القادم" hint="حضّره" />
                    <div class={onPage('next')}>
                      <NextCard course={course} next={course.next} read={!!onPage('next') && frame.done} when={`${dayWord(course.next.date, now)} بعد ${slot} · ${clock12(course.next.time)}`} onTick={noop} />
                    </div>
                  </>
                )}
                {recording && (
                  <>
                    <Sec title="آخر درس" hint="راجعه" />
                    <div class={onPage('recording')}>
                      <RecordingCard course={course} lesson={recording} reviewed={!!onPage('recording') && frame.done} onPlay={noop} onTick={noop} />
                    </div>
                  </>
                )}
              </div>
              {frame.opened && to.kind === 'live' && <LivePlayer card={card} state={state} playing={frame.playing} />}
              {frame.opened && to.kind === 'book' && <BookPage card={card} to={to} read={frame.done} />}
              {(frame.opened || web) && <RecordingPlayer card={card} frame={frame} />}
              {to.kind === 'stream' && <StreamPlayer card={card} state={state} frame={frame} />}
            </div>
          </div>
        </div>
        {!web && (
          <div class="pv-banner">
            <img src="/favicon.png" alt="" />
            <div class="t">
              <span class="h">
                <span>سليمان الرحيلي مباشر</span>
                <span>الآن</span>
              </span>
              <b>{notice.title}</b>
              <span class="bd">{notice.body}</span>
            </div>
            <i class="pv-ring" />
          </div>
        )}
        <span class="pv-cap">{caption(play, variant)}</span>
      </figure>
    </>
  );
}
