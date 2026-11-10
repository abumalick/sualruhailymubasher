import type { CourseDTO, LessonDTO } from '@albadr/shared';
import { useEffect, useState } from 'preact/hooks';
import { startLive } from './audio/live';
import { CLOSED, nextLivePlayer, type LiveEvent } from './logic/live';
import { player } from './audio/player';
import { useRoute } from './router';
import { unfollowed } from './logic/follow';
import { boot, nowOverride, refresh, toggleTick, useAppData, viewOf } from './store';
import { Book } from './ui/Book';
import { Course } from './ui/Course';
import { Courses } from './ui/Courses';
import { Chooser, FollowNotice, NotFollowed } from './ui/Follow';
import { Links } from './ui/Links';
import { Home } from './ui/Home';
import { LiveSheet } from './ui/LiveSheet';
import { MiniPlayer } from './ui/MiniPlayer';
import { Notifications } from './ui/Notifications';
import { About } from './ui/About';
import { isNative } from './platform';
import { ar, arText } from './ui/format';
import { NavBar } from './ui/NavBar';
import { Defs } from './ui/Star';

export function App() {
  document.documentElement.dir = 'rtl';
  document.documentElement.lang = 'ar';
  document.documentElement.classList.toggle('web', !isNative());
  const route = useRoute();
  const data = useAppData();
  const { ticks, error, follow } = data;
  const state = viewOf(data);
  const [livePlayer, setLivePlayer] = useState(CLOSED);
  const [welcome, setWelcome] = useState(false);
  const send = (e: LiveEvent) => setLivePlayer((p) => nextLivePlayer(p, e));
  useEffect(() => void boot(), []);
  useEffect(() => send({ type: 'navigate' }), [route]);
  useEffect(() => void (state && send({ type: 'state', live: state.live })), [state?.live]);
  useEffect(() => {
    if (!follow) return;
    if (unfollowed(player.state.src?.courseId, follow)) player.stop();
    if (unfollowed(livePlayer.courseId, follow)) send({ type: 'close' });
  }, [follow?.ids.join()]);
  const notice = (always = false) => data.state && follow && <FollowNotice state={data.state} follow={follow} always={always} />;
  const hidden = (id: string) => !!data.state?.courses.some((c) => c.id === id);

  if (follow === null || welcome) {
    return (
      <div class="shell">
        <Defs />
        <div class="scroll">
          <Chooser state={data.state} follow={follow ?? null} first onHold={setWelcome} />
        </div>
      </div>
    );
  }
  const native = isNative();
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
    page = <Home state={state} ticks={ticks} now={now} error={error} onTick={onTick} onPlay={onPlay} onLive={onLive} onRetry={() => void refresh()} notice={notice()} />;
  } else if (route.name === 'courses') {
    page = <Courses state={state} notice={notice(true)} />;
  } else if (route.name === 'course') {
    const course = state?.courses.find((c) => c.id === route.id);
    if (course) page = <Course key={course.id} course={course} ticks={ticks} onTick={onTick} onPlay={onPlay} />;
    else if (hidden(route.id)) page = <NotFollowed />;
  } else if (route.name === 'notifications') {
    page = native ? <Notifications state={state} notice={notice(true)} /> : <About native={false} />;
  } else if (route.name === 'about') {
    page = <About native={native} back={native ? '#/links' : undefined} />;
  } else if (route.name === 'follow') {
    if (follow) page = <Chooser key={follow.ids.join()} state={data.state} follow={follow} first={false} />;
  } else if (route.name === 'links') {
    page = <Links state={state} />;
  }

  let body;
  if (route.name === 'book') {
    const course = state?.courses.find((c) => c.id === route.id);
    body = !course && hidden(route.id) ? (
      <NotFollowed />
    ) : course ? (
      <Book key={`${course.id}/${route.pdfIndex}`} course={course} pdfIndex={route.pdfIndex} page={route.page} marker={route.marker} ticks={ticks} onTick={onTick} />
    ) : state ? (
      <div class="booker">
        <p class="quiet">تعذّر تحميل الكتاب</p>
        <a class="chip" href="#/courses">
          الدروس
        </a>
      </div>
    ) : (
      <p class="quiet">{error ? 'تعذّر التحديث' : '…'}</p>
    );
  } else {
    body = (
      <div class="scroll">
        {route.name !== 'home' && error && !state && <p class="err">تعذّر التحديث</p>}
        {page}
      </div>
    );
  }

  // One tree for every route, so the live player keeps its place and its iframe is never re-mounted.
  const live = livePlayer.view !== 'closed' && state;
  return (
    <div class={route.name === 'home' ? 'shell lat' : 'shell'}>
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
      {route.name !== 'book' && <NavBar route={route} />}
    </div>
  );
}
