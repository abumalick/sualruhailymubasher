import { beforeEach, expect, it, vi } from 'vitest';

type Router = typeof import('../src/router');
let router: Router;

beforeEach(async () => {
  vi.restoreAllMocks();
  history.replaceState(null, '', '#/');
  vi.resetModules();
  router = await import('../src/router');
});

const open = (hash: string) => {
  history.pushState(null, '', hash);
  router.trackEntry();
};

it('pops back to the page the reader came from', () => {
  const back = vi.spyOn(history, 'back').mockImplementation(() => {});
  router.trackEntry();
  open('#/book/tafsir-saadi/0/12?marker=1');
  router.goBack('#/course/tafsir-saadi');
  expect(back).toHaveBeenCalledOnce();
});

it('opens the fallback in place when nothing of the app sits behind the page', () => {
  const back = vi.spyOn(history, 'back');
  history.replaceState(null, '', '#/book/tafsir-saadi/0/12');
  router.trackEntry();
  router.goBack('#/');
  expect(back).not.toHaveBeenCalled();
  expect(location.hash).toBe('#/');
});

it('knows its place again after going back, and after a reload', async () => {
  const back = vi.spyOn(history, 'back').mockImplementation(() => {});
  router.trackEntry();
  open('#/more');
  history.replaceState(history.state, '', location.hash);
  vi.resetModules();
  router = await import('../src/router');
  router.trackEntry();
  router.goBack('#/');
  expect(back).toHaveBeenCalledOnce();

  history.replaceState({ depth: 0 }, '', '#/');
  router.trackEntry();
  router.goBack('#/more');
  expect(back).toHaveBeenCalledOnce();
  expect(location.hash).toBe('#/more');
});

it('the page the fallback opens is still the first of the app, so its own back falls back too', () => {
  const back = vi.spyOn(history, 'back');
  history.replaceState(null, '', '#/book/tafsir-saadi/0/12');
  router.trackEntry();
  router.goBack('#/course/tafsir-saadi');
  router.trackEntry();
  router.goBack('#/more');
  expect(back).not.toHaveBeenCalled();
  expect(location.hash).toBe('#/more');
});

it('a repeated hashchange for the hash already shown is not a new route', async () => {
  const { render } = await import('@testing-library/preact');
  const routes: unknown[] = [];
  function Probe() {
    routes.push(router.useRoute());
    return null;
  }
  render(<Probe />);
  await Promise.resolve();
  location.hash = '#/more';
  dispatchEvent(new HashChangeEvent('hashchange'));
  dispatchEvent(new HashChangeEvent('hashchange'));
  await new Promise((r) => setTimeout(r, 20));
  const distinct = routes.filter((r, i) => r !== routes[i - 1]);
  expect(distinct).toEqual([{ name: 'home' }, { name: 'more' }]);
});
