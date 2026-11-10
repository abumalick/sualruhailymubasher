import { isNative } from '../platform';
import type { Route } from '../router';

const HOME = { label: 'الرئيسية', icon: 'i-home', href: '#/', names: ['home'] };
const COURSES = { label: 'الدروس', icon: 'i-book', href: '#/courses', names: ['courses', 'course', 'book'] };
const NOTIFICATIONS = { label: 'التنبيهات', icon: 'i-bell', href: '#/notifications', names: ['notifications'] };
const ABOUT = { label: 'عن التطبيق', icon: 'i-info', href: '#/about', names: ['about', 'notifications'] };
const LINKS = { label: 'روابط', icon: 'i-link', href: '#/links', names: ['links'] };
const LINKS_NATIVE = { ...LINKS, names: ['links', 'about'] };

// The web has no push: its third tab tells visitors about the app instead (the native apps reach it from روابط).
export const tabs = (native: boolean) => (native ? [HOME, COURSES, NOTIFICATIONS, LINKS_NATIVE] : [HOME, COURSES, ABOUT, LINKS]);

export function NavBar({ route }: { route: Route }) {
  return (
    <nav class="nav">
      {tabs(isNative()).map((t) => (
        <a href={t.href} class={t.names.includes(route.name) ? 'on' : ''}>
          <svg><use href={`#${t.icon}`} /></svg>
          {t.label}
        </a>
      ))}
    </nav>
  );
}
