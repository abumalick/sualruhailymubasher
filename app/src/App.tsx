import type { CourseDTO, LessonDTO } from '@albadr/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { startLive } from './audio/live';
import { onBackButton } from './backButton';
import { backAction, bookBack, CLOSED, listeningLive, nextLivePlayer, type LiveEvent } from './logic/live';
import { player } from './audio/player';
import { navigate, parseRoute, replaceRoute, useRoute } from './router';
import { attended } from './logic/prefs';
import { defaultTab, lessonTabs } from './logic/tabs';
import { boot, clearLive, finishOnboarding, nowOverride, refresh, setWanted, toggleTick, useAppData } from './store';
import { liveIntentAction } from './logic/liveIntent';
import { Book } from './ui/Book';
import { Lesson } from './ui/Lesson';
import { Onboarding } from './ui/Onboarding';
import { Links } from './ui/Links';
import { LiveSheet } from './ui/LiveSheet';
import { MiniPlayer } from './ui/MiniPlayer';
import { Notifications } from './ui/Notifications';
import { About } from './ui/About';
import { More } from './ui/More';
import { nativeUI } from './platform';
import { ar, arText } from './ui/format';
import { NavBar } from './ui/NavBar';
import { Defs } from './ui/Star';

export function App() {
  document.documentElement.dir = 'rtl';
  document.documentElement.lang = 'ar';
  document.documentElement.classList.toggle('web', !nativeUI());
  const route = useRoute();
  const data = useAppData();
  const { ticks, error, prefs, onboarded, state } = data;
  const [livePlayer, setLivePlayer] = useState(CLOSED);
  const send = (e: LiveEvent) => setLivePlayer((p) => nextLivePlayer(p, e));
  const [playerSrc, setPlayerSrc] = useState(player.state.src);
  useEffect(() => player.onChange((s) => setPlayerSrc(s.src)), []);
  useEffect(() => void boot(), []);
  const current = useRef(livePlayer);
  current.current = livePlayer;
  const onboardingBack = useRef<(() => void) | null>(null);
  useEffect(
    () =>
      onBackButton((canGoBack) => {
        if (onboardingBack.current) return onboardingBack.current();
        const action = backAction(current.current, canGoBack);
        if (action === 'collapse') send({ type: 'collapse' });
        else if (action === 'back') history.back();
      }),
    [],
  );
  // A layout effect, so a tap on the new page can't land before the collapse it would then undo.
  useLayoutEffect(() => send({ type: 'navigate' }), [route]);
  useEffect(() => void (state && send({ type: 'state', live: state.live })), [state?.live]);
  const autoPicked = useRef<string | null>(null);
  const freshSeen = useRef(false);
  useEffect(() => {
    if (route.name === 'home' && state) {
      const id = defaultTab(state, nowOverride() ?? new Date(), attended(prefs ?? null, state.courses));
      if (id) {
        autoPicked.current = id;
        replaceRoute(`#/course/${id}`);
      }
    } else if (!(route.name === 'course' && route.id === autoPicked.current)) {
      autoPicked.current = null;
    }
  }, [route, state]);
  // The cached state rarely knows a broadcast that began while the app was closed: correct the tab picked from it once,
  // unless the listener has moved since.
  useEffect(() => {
    if (!data.fresh || freshSeen.current) return;
    freshSeen.current = true;
    const picked = autoPicked.current;
    if (!picked || !state || route.name !== 'course' || route.id !== picked) return;
    const id = defaultTab(state, nowOverride() ?? new Date(), attended(prefs ?? null, state.courses));
    if (id && id !== picked) {
      autoPicked.current = id;
      replaceRoute(`#/course/${id}`);
    }
  }, [data.fresh]);
  // Declared after the navigate collapse and the tab picking, so the player it opens stays expanded.
  const intentReached = useRef(false);
  useEffect(() => {
    const intent = data.intent;
    if (!intent) {
      intentReached.current = false;
      return;
    }
    if (!state || route.name === 'home' || JSON.stringify(parseRoute(location.hash)) !== JSON.stringify(route)) return;
    const followed = intent.courseId === null || state.courses.some((c) => c.id === intent.courseId);
    const onTarget = intent.courseId === null || (route.name === 'course' && route.id === intent.courseId);
    if (followed && !onTarget) {
      if (intentReached.current) clearLive();
      return;
    }
    intentReached.current = true;
    const action = followed ? liveIntentAction(intent, state, intent.fresh, intent.failed) : 'drop';
    if (action === 'wait') return;
    clearLive();
    if (action === 'open') startLive(state, () => send({ type: 'open', live: { ...state.live, isLive: true, courseId: intent.courseId } }));
  }, [route, data.intent, state]);
  if (onboarded === undefined) return <div class="shell" />;
  if ((!onboarded && !data.tapped) || route.name === 'welcome') {
    return (
      <div class="shell">
        <Defs />
        <div class="scroll">
          <Onboarding
            state={state}
            prefs={prefs ?? null}
            now={nowOverride() ?? new Date()}
            replay={!!onboarded}
            backRef={onboardingBack}
            onLeave={() => navigate('#/more')}
            onDone={(p) => void finishOnboarding(p).then(() => navigate('#/'))}
          />
        </div>
      </div>
    );
  }
  const native = nativeUI();
  const now = nowOverride() ?? new Date();
  const onLive = () => state && startLive(state, () => send({ type: 'open', live: state.live }));
  const onTick = (kind: 'read' | 'reviewed', courseId: string, n: number) => void toggleTick(kind, courseId, n);
  const onPlay = (lesson: LessonDTO, course: CourseDTO) => {
    if (!lesson.recordingUrl) return;
    player.endEmbed();
    send({ type: 'play-recording' });
    void player.play({
      url: lesson.recordingUrl,
      title: `${course.title} · الدرس ${ar(lesson.number)}`,
      subtitle: arText(lesson.startPoint),
      kind: 'recording',
      courseId: course.id,
    });
  };

  let page = null;
  if (route.name === 'home') {
    if (state) {
      page = state.courses.length > 0 ? null : <p class="quiet">لا توجد دروس حالية</p>;
    } else {
      page = (
        <>
          <p class="quiet">{error ? 'تعذّر التحديث' : '…'}</p>
          {error && (
            <button class="chip retry" onClick={() => void refresh()}>
              إعادة المحاولة
            </button>
          )}
        </>
      );
    }
  } else if (route.name === 'more') {
    page = <More />;
  } else if (route.name === 'course') {
    const course = state?.courses.find((c) => c.id === route.id);
    if (course && state) {
      const { live: onAir } = state;
      const other = state.courses.find((c) => c.id === onAir.courseId);
      const otherLive = !onAir.isLive || onAir.courseId === course.id ? null : onAir.courseId === null ? { course: null } : other ? { course: other } : null;
      page = <Lesson key={course.id} course={course} live={onAir} otherLive={otherLive} ticks={ticks} now={now} listening={listeningLive(livePlayer, playerSrc)} onTick={onTick} onPlay={onPlay} onLive={onLive} />;
    }
  } else if (route.name === 'notifications') {
    page = native ? <Notifications state={state} prefs={prefs ?? null} onToggle={(topic, on) => void setWanted(topic, on)} /> : <About native={false} />;
  } else if (route.name === 'about') {
    page = <About native={native} />;
  } else if (route.name === 'links') {
    page = <Links state={state} />;
  }

  let body;
  if (route.name === 'book') {
    const course = state?.courses.find((c) => c.id === route.id);
    body = course ? (
      <Book key={`${course.id}/${route.pdfIndex}`} course={course} pdfIndex={route.pdfIndex} page={route.page} marker={route.marker} ticks={ticks} onTick={onTick} back={bookBack(course.id)} />
    ) : state ? (
      <div class="booker">
        <p class="quiet">تعذّر تحميل الكتاب</p>
        <a class="chip" href="#/">
          الدروس
        </a>
      </div>
    ) : (
      <p class="quiet">{error ? 'تعذّر التحديث' : '…'}</p>
    );
  } else {
    body = (
      <div class="scroll">
        {error && (state || route.name !== 'home') && <p class="err">تعذّر التحديث</p>}
        {page}
      </div>
    );
  }

  // One tree for every route, so the live player keeps its place and its iframe is never re-mounted.
  const live = livePlayer.view !== 'closed' && state;
  return (
    <div class={route.name === 'course' ? 'shell lat' : 'shell'}>
      <Defs />
      {body}
      {live ? (
        <LiveSheet
          live={state.live}
          course={state.courses.find((c) => c.id === livePlayer.courseId)}
          startedAt={livePlayer.startedAt}
          expanded={livePlayer.view === 'expanded'}
          inBook={route.name === 'book'}
          onExpand={() => send({ type: 'expand' })}
          onCollapse={() => send({ type: 'collapse' })}
          onClose={() => send({ type: 'close' })}
        />
      ) : (
        <MiniPlayer />
      )}
      {route.name !== 'book' && <NavBar route={route} tabs={lessonTabs(state)} />}
    </div>
  );
}
