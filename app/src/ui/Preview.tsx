import type { StateDTO } from '@albadr/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { bookBack, liveContext } from '../logic/live';
import type { Card } from '../logic/onboarding';
import { previewAt, previewDestination, previewGeometry, previewNotice, screenOffset, type Destination } from '../logic/preview';
import { BookBar, BookFoot } from './Book';
import { NextCard, RecordingCard } from './cards';
import { clock12, dayWord, passageRange, printedPage, slotName } from './format';
import { LessonHead, Sec } from './Lesson';
import { LiveHead } from './LiveSheet';
import { Icon } from './Star';

const noop = () => {};

const SPOKEN: Record<Card['kind'], string> = {
  live: 'صورة توضيحية: يصلك تنبيه عند بدء البث، فيفتح مشغّل البث المباشر.',
  recording: 'صورة توضيحية: يصلك تنبيه عند نشر التسجيل، فيفتح الدرس على التسجيل.',
  next: 'صورة توضيحية: يصلك تذكير قبل الدرس، فيفتح الكتاب على مقطع الدرس القادم.',
};

function useReducedMotion(): boolean {
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
function useFrame(to: Destination['kind'], step: string, reduced: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const now = Date.now() - start;
      setElapsed(now);
      const { wait } = previewAt(to, now, reduced);
      if (wait !== null) timer = setTimeout(tick, wait);
    };
    tick();
    return () => clearTimeout(timer);
  }, [to, step, reduced]);
  return previewAt(to, elapsed, reduced).frame;
}

// The live player as it opens over the lesson; Mixlr's own player is drawn, never loaded.
function LivePlayer({ card, state }: { card: Card; state: StateDTO }) {
  const startedAt = state.live.isLive && state.live.courseId === card.course.id ? state.live.startedAt : null;
  return (
    <div class="sheet">
      <div class="lhead">
        <LiveHead ctx={liveContext(card.course, true, startedAt)} onMinimize={noop} onReload={noop} onCollapse={noop} onClose={noop} />
      </div>
      <div class="pv-mixlr">
        <span>
          <Icon id="play" />
        </span>
        <b>
          <i />
          <i />
          <i />
          <i />
          <i />
        </b>
      </div>
    </div>
  );
}

// The book open at the next passage; its page is drawn, never downloaded.
function BookPage({ card, to }: { card: Card; to: Extract<Destination, { kind: 'book' }> }) {
  const { course } = card;
  return (
    <div class="book">
      <BookBar course={course} range={to.marker ? passageRange(course, to.pdfIndex, to.page) : ''} shown={printedPage(course, to.pdfIndex, to.page)} back={bookBack(course.id)} />
      <div class="pdfwrap">
        <div class="pg pv-page">
          {to.marker && <span class="mkbanner">بداية الدرس تقريبًا</span>}
          {Array.from({ length: 14 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
      </div>
      <BookFoot tick={course.next ? { done: false, onTick: noop } : null} />
    </div>
  );
}

// A picture of what the notification does: it looks real, plays by itself, and nothing in it can be tapped or focused.
export function Preview({ card, state, now }: { card: Card; state: StateDTO; now: Date }) {
  const { course } = card;
  const to = previewDestination(card, state);
  const reduced = useReducedMotion();
  const frame = useFrame(to.kind, `${card.kind}:${course.id}`, reduced);
  const notice = previewNotice(card, state.live);
  const panel = useRef<HTMLElement>(null);
  const [geo, setGeo] = useState<{ scale: number; bannerScale: number; offset: number } | null>(null);

  useLayoutEffect(() => {
    const el = panel.current!;
    const measure = () => {
      const { scale, bannerScale } = previewGeometry(el.clientWidth);
      const target = el.querySelector<HTMLElement>('.pv-target');
      const banner = el.querySelector<HTMLElement>('.pv-banner')!;
      setGeo({ scale, bannerScale, offset: target ? screenOffset(target.offsetTop, frame.still, scale, banner.offsetHeight) : 0 });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [course.id, card.kind, frame.still]);

  const block = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const slot = slotName(course.slot);
  const latest = course.latest[0];
  const recording = card.kind === 'recording' ? card.lesson : latest?.recordingUrl ? latest : null;
  const onPage = (kind: Card['kind']) => (to.kind === 'lesson' && card.kind === kind ? 'pv-target pv-tickable' : undefined);
  const scrolled = to.kind === 'lesson' && frame.opened;
  const style = geo ? `--s:${geo.scale};--bs:${geo.bannerScale};--pv-y:${scrolled ? geo.offset : 0}px` : undefined;
  return (
    <>
      <p class="sr">{SPOKEN[card.kind]}</p>
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
                {course.next && (
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
              {frame.opened && to.kind === 'live' && <LivePlayer card={card} state={state} />}
              {frame.opened && to.kind === 'book' && <BookPage card={card} to={to} />}
            </div>
          </div>
        </div>
        <div class="pv-banner">
          <img src="/favicon.png" alt="" />
          <div class="t">
            <span class="h">
              <span>البدر مباشر</span>
              <span>الآن</span>
            </span>
            <b>{notice.title}</b>
            <span class="bd">{notice.body}</span>
          </div>
          <i class="pv-ring" />
        </div>
        <span class="pv-cap">مثال: هكذا يصلك التنبيه</span>
      </figure>
    </>
  );
}
