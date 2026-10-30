import type { CourseDTO, LessonDTO } from '@albadr/shared';
import { useEffect } from 'preact/hooks';
import { useRoute } from './router';
import { boot, nowOverride, toggleTick, useAppData } from './store';
import { Course } from './ui/Course';
import { Courses } from './ui/Courses';
import { Home } from './ui/Home';
import { NavBar } from './ui/NavBar';
import { Defs } from './ui/Star';

const onPlay = (_lesson: LessonDTO, _course: CourseDTO) => {};
const onLive = () => {};

export function App() {
  document.documentElement.dir = 'rtl';
  document.documentElement.lang = 'ar';
  const route = useRoute();
  const { state, ticks, error } = useAppData();
  useEffect(() => void boot(), []);
  const now = nowOverride() ?? new Date();
  const onTick = (kind: 'read' | 'reviewed', courseId: string, n: number) => void toggleTick(kind, courseId, n);

  let page = null;
  if (route.name === 'home') {
    page = <Home state={state} ticks={ticks} now={now} error={error} onTick={onTick} onPlay={onPlay} onLive={onLive} />;
  } else if (route.name === 'courses') {
    page = <Courses state={state} />;
  } else if (route.name === 'course') {
    const course = state?.courses.find((c) => c.id === route.id);
    if (course) page = <Course key={course.id} course={course} ticks={ticks} onTick={onTick} onPlay={onPlay} />;
  }

  return (
    <div class={route.name === 'home' ? 'shell lat' : 'shell'}>
      <Defs />
      <div class="scroll">
        {route.name !== 'home' && error && !state && <p class="err">تعذّر التحديث</p>}
        {page}
      </div>
      <NavBar route={route} />
    </div>
  );
}
