import { useEffect, useState } from 'preact/hooks';

export type Route =
  | { name: 'home' }
  | { name: 'courses' }
  | { name: 'course'; id: string }
  | { name: 'book'; id: string; pdfIndex: number; page: number; marker: boolean }
  | { name: 'notifications' }
  | { name: 'links' };

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.split('?');
  const parts = path.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (parts[0]) {
    case 'courses':
      return { name: 'courses' };
    case 'course':
      return parts[1] ? { name: 'course', id: parts[1] } : { name: 'courses' };
    case 'book':
      return parts[1]
        ? { name: 'book', id: parts[1], pdfIndex: Number(parts[2] ?? 0) || 0, page: Number(parts[3] ?? 1) || 1, marker: new URLSearchParams(query).get('marker') === '1' }
        : { name: 'courses' };
    case 'notifications':
      return { name: 'notifications' };
    case 'links':
      return { name: 'links' };
    default:
      return { name: 'home' };
  }
}

export function navigate(path: string) {
  location.hash = path;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
