import type { CourseDTO, LessonDTO } from '@albadr/shared';
import { useEffect, useState } from 'preact/hooks';
import { startLive } from './audio/live';
import { player } from './audio/player';
import { useRoute } from './router';
import { boot, nowOverride, refresh, toggleTick, useAppData } from './store';
import { Book } from './ui/Book';
import { Course } from './ui/Course';
import { Courses } from './ui/Courses';
import { Links } from './ui/Links';
import { Home } from './ui/Home';
import { LiveSheet } from './ui/LiveSheet';
import { MiniPlayer } from './ui/MiniPlayer';
import { Notifications } from './ui/Notifications';
import { ar, arText } from './ui/format';
import { NavBar } from './ui/NavBar';
import { Defs } from './ui/Star';

type LiveView = 'closed' | 'expanded' | 'collapsed';

export function App() {
  document.documentElement.dir = 'rtl';
  document.documentElement.lang = 'ar';
  const route = useRoute();
  const { state, ticks, error } = useAppData();
  const [liveView, setLiveView] = useState<LiveView>('closed');
  useEffect(() => void boot(), []);
  useEffect(() => setLiveView((v) => (v === 'expanded' ? 'collapsed' : v)), [route]);
  const now = nowOverride() ?? new Date();
  const onLive = () => state && startLive(state, () => setLiveView('expanded'));
  const onTick = (kind: 'read' | 'reviewed', courseId: string, n: number) => void toggleTick(kind, courseId, n);
  const onPlay = (lesson: LessonDTO, course: CourseDTO) => {
    if (!lesson.recordingUrl) return;
    player.endEmbed();
    setLiveView('closed');
    void player.play({
      url: lesson.recordingUrl,
      title: `${course.title} · الدرس ${ar(lesson.number)}`,
      subtitle: arText(lesson.startPoint),
      kind: 'recording',
    });
  };

  let page = null;
  if (route.name === 'home') {
    page = <Home state={state} ticks={ticks} now={now} error={error} onTick={onTick} onPlay={onPlay} onLive={onLive} onRetry={() => void refresh()} />;
  } else if (route.name === 'courses') {
    page = <Courses state={state} />;
  } else if (route.name === 'course') {
    const course = state?.courses.find((c) => c.id === route.id);
    if (course) page = <Course key={course.id} course={course} ticks={ticks} onTick={onTick} onPlay={onPlay} />;
  } else if (route.name === 'notifications') {
    page = <Notifications state={state} />;
  } else if (route.name === 'links') {
    page = <Links state={state} />;
  }

  let body;
  if (route.name === 'book') {
    const course = state?.courses.find((c) => c.id === route.id);
    body = course ? (
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
  const live = liveView !== 'closed' && state;
  return (
    <div class={route.name === 'home' ? 'shell lat' : 'shell'}>
      <Defs />
      {body}
      {live ? (
        <LiveSheet
          live={state.live}
          course={state.courses.find((c) => c.id === state.live.courseId)}
          expanded={liveView === 'expanded'}
          onBook={route.name === 'book'}
          onExpand={() => setLiveView('expanded')}
          onCollapse={() => setLiveView('collapsed')}
          onClose={() => setLiveView('closed')}
        />
      ) : (
        <MiniPlayer />
      )}
      {route.name !== 'book' && <NavBar route={route} />}
    </div>
  );
}
