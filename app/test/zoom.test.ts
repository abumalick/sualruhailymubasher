import { afterEach, beforeEach, expect, it } from 'vitest';
import { leavesBook, resetZoom } from '../src/zoom';

const CONTENT = 'width=device-width, initial-scale=1, viewport-fit=cover';
let meta: HTMLMetaElement;
beforeEach(() => {
  meta = document.createElement('meta');
  meta.name = 'viewport';
  meta.content = CONTENT;
  document.head.append(meta);
});
afterEach(() => meta.remove());

it('only leaving the book, the one page that zooms, resets the zoom', () => {
  expect(leavesBook('book', 'course')).toBe(true);
  expect(leavesBook('book', 'welcome')).toBe(true);
  expect(leavesBook('book', 'book')).toBe(false);
  expect(leavesBook('course', 'book')).toBe(false);
  expect(leavesBook('course', 'more')).toBe(false);
  expect(leavesBook(null, 'course')).toBe(false);
});

it('caps the page at its normal scale for a moment, which brings a zoomed page back, then lets the book zoom again', async () => {
  resetZoom();
  expect(meta.content).toBe(`${CONTENT}, maximum-scale=1`);
  await new Promise((r) => setTimeout(r, 400));
  expect(meta.content).toBe(CONTENT);
});

it('leaving the book twice in quick succession still lifts the cap, so the book can zoom again', async () => {
  resetZoom();
  await new Promise((r) => setTimeout(r, 100));
  resetZoom();
  expect(meta.content).toBe(`${CONTENT}, maximum-scale=1`);
  await new Promise((r) => setTimeout(r, 500));
  expect(meta.content).toBe(CONTENT);
});

it('does nothing without a viewport tag', () => {
  meta.remove();
  expect(() => resetZoom()).not.toThrow();
});
