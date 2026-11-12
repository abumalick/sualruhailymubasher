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
  open('#/courses');
  history.replaceState(history.state, '', location.hash);
  vi.resetModules();
  router = await import('../src/router');
  router.trackEntry();
  router.goBack('#/');
  expect(back).toHaveBeenCalledOnce();

  history.replaceState({ depth: 0 }, '', '#/');
  router.trackEntry();
  router.goBack('#/courses');
  expect(back).toHaveBeenCalledOnce();
  expect(location.hash).toBe('#/courses');
});

it('the page the fallback opens is still the first of the app, so its own back falls back too', () => {
  const back = vi.spyOn(history, 'back');
  history.replaceState(null, '', '#/book/tafsir-saadi/0/12');
  router.trackEntry();
  router.goBack('#/course/tafsir-saadi');
  router.trackEntry();
  router.goBack('#/courses');
  expect(back).not.toHaveBeenCalled();
  expect(location.hash).toBe('#/courses');
});
