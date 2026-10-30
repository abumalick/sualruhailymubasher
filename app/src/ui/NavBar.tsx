import type { Route } from '../router';

const TABS = [
  { label: 'الرئيسية', icon: 'i-home', href: '#/', names: ['home'] },
  { label: 'الدروس', icon: 'i-book', href: '#/courses', names: ['courses', 'course', 'book'] },
  { label: 'التنبيهات', icon: 'i-bell', href: '#/notifications', names: ['notifications'] },
  { label: 'روابط', icon: 'i-link', href: '#/links', names: ['links'] },
];

export function NavBar({ route }: { route: Route }) {
  return (
    <nav class="nav">
      {TABS.map((t) => (
        <a href={t.href} class={t.names.includes(route.name) ? 'on' : ''}>
          <svg><use href={`#${t.icon}`} /></svg>
          {t.label}
        </a>
      ))}
    </nav>
  );
}
