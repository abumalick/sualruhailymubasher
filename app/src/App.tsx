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

const onPlay = (lesson: LessonDTO, course: CourseDTO) => {
  if (!lesson.recordingUrl) return;
  void player.play({
    url: lesson.recordingUrl,
    title: `${course.title} · الدرس ${ar(lesson.number)}`,
    subtitle: arText(lesson.startPoint),
    kind: 'recording',
  });
};

export function App() {
  document.documentElement.dir = 'rtl';
  document.documentElement.lang = 'ar';
  const route = useRoute();
  const { state, ticks, error } = useAppData();
  const [sheet, setSheet] = useState(false);
  useEffect(() => void boot(), []);
  const now = nowOverride() ?? new Date();
  const onLive = () => state && startLive(state, () => setSheet(true));
  const onTick = (kind: 'read' | 'reviewed', courseId: string, n: number) => void toggleTick(kind, courseId, n);

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

  if (route.name === 'book') {
    const course = state?.courses.find((c) => c.id === route.id);
    return (
      <div class="shell">
        <Defs />
        {course ? (
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
        )}
        <MiniPlayer />
      </div>
    );
  }

  return (
    <div class={route.name === 'home' ? 'shell lat' : 'shell'}>
      <Defs />
      <div class="scroll">
        {route.name !== 'home' && error && !state && <p class="err">تعذّر التحديث</p>}
        {page}
      </div>
      <MiniPlayer />
      <NavBar route={route} />
      {sheet && state && (
        <LiveSheet
          live={state.live}
          title={state.courses.find((c) => c.id === state.live.courseId)?.title ?? 'البث المباشر'}
          onClose={() => setSheet(false)}
        />
      )}
    </div>
  );
}
