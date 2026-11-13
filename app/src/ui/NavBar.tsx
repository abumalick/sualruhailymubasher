import type { LessonTab } from '../logic/tabs';
import type { Route } from '../router';

const MORE = ['more', 'notifications', 'links', 'about'];

export function NavBar({ route, tabs }: { route: Route; tabs: LessonTab[] }) {
  const onCourse = route.name === 'course' || route.name === 'book' ? route.id : null;
  return (
    <nav class="nav">
      {tabs.map((t) => (
        <a href={`#/course/${t.courseId}`} data-slot={t.slot} class={onCourse === t.courseId ? 'on' : ''} key={t.courseId}>
          {t.live && <i class="ld" />}
          <svg><use href={t.slot === 'fajr' ? '#i-sun' : '#i-moon'} /></svg>
          {t.label}
        </a>
      ))}
      <a href="#/more" class={MORE.includes(route.name) ? 'on' : ''}>
        <svg><use href="#i-more" /></svg>
        المزيد
      </a>
    </nav>
  );
}
