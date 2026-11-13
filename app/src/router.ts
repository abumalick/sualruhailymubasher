import { useEffect, useState } from 'preact/hooks';

export type Route =
  | { name: 'home' }
  | { name: 'more' }
  | { name: 'course'; id: string }
  | { name: 'book'; id: string; pdfIndex: number; page: number; marker: boolean }
  | { name: 'notifications' }
  | { name: 'links' }
  | { name: 'about' }
  | { name: 'welcome' };

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.split('?');
  const parts = path.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (parts[0]) {
    case 'more':
      return { name: 'more' };
    case 'course':
      return parts[1] ? { name: 'course', id: parts[1] } : { name: 'home' };
    case 'book':
      return parts[1]
        ? { name: 'book', id: parts[1], pdfIndex: Number(parts[2] ?? 0) || 0, page: Number(parts[3] ?? 1) || 1, marker: new URLSearchParams(query).get('marker') === '1' }
        : { name: 'home' };
    case 'notifications':
      return { name: 'notifications' };
    case 'links':
      return { name: 'links' };
    case 'about':
      return { name: 'about' };
    case 'welcome':
      return { name: 'welcome' };
    default:
      return { name: 'home' };
  }
}

export function navigate(path: string) {
  location.hash = path;
}

// Swaps the current entry, so back never returns to it.
export function replaceRoute(path: string) {
  replacing = true;
  location.replace(path);
}

// Each history entry records how many of the app's own entries sit behind it, so a back control can tell whether
// popping stays in the app. A push or a deep link can open a page with nothing of the app's behind it.
let depth: number | null = null;
let replacing = false;

export function trackEntry() {
  const own: unknown = history.state?.depth;
  depth = typeof own === 'number' ? own : depth === null ? 0 : replacing ? depth : depth + 1;
  replacing = false;
  if (own !== depth) history.replaceState({ ...history.state, depth }, '');
}

// Pops, rather than pushing the fallback, so the system back button never returns to the page just left.
export function goBack(fallback: string) {
  if (depth) history.back();
  else {
    replacing = true;
    location.replace(fallback);
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    trackEntry();
    let shown = location.hash;
    // Some engines fire hashchange twice for one change; a second one is not a navigation.
    const onChange = () => {
      if (location.hash === shown) return;
      shown = location.hash;
      trackEntry();
      setRoute(parseRoute(location.hash));
    };
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
