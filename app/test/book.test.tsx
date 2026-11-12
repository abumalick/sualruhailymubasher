import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const files = new Map<string, string>();
const fs = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
}));
vi.mock('@capacitor/filesystem', () => ({ Directory: { Data: 'DATA' }, Filesystem: fs }));
const platform = vi.hoisted(() => ({ native: false }));
vi.mock('../src/platform', () => ({ isNative: () => platform.native, nativeUI: () => platform.native }));
const http = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@capacitor/core', async (orig) => ({
  ...(await orig<typeof import('@capacitor/core')>()),
  CapacitorHttp: http,
}));

const parse = vi.hoisted(() => ({ reject: false, started: false, pending: null as Promise<unknown> | null }));
const rendered: number[] = [];
const pdfDoc = vi.hoisted(() => ({ numPages: 20, destroy: vi.fn(), getPage: vi.fn() }));
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => {
    parse.started = true;
    return { promise: parse.reject ? Promise.reject(new Error('bad')) : (parse.pending ?? Promise.resolve(pdfDoc)), destroy: vi.fn() };
  },
}));
vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }));

import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { getPdf, dropPdf, proxyUrl } from '../src/pdf/cache';
import { Book } from '../src/ui/Book';
import { trackEntry } from '../src/router';

const course = FIXTURE_STATE.courses[0];
const url = course.pdfUrls[0];
const file = { courseId: course.id, index: 0, url };
const none = { read: new Set<string>(), reviewed: new Set<string>() };
const bytes = new Uint8Array([37, 80, 68, 70, 45, 49]);
const b64 = btoa(String.fromCharCode(...bytes));

const book = (page: number, marker = false, extra = {}) => (
  <Book course={course} pdfIndex={0} page={page} marker={marker} ticks={none} onTick={vi.fn()} back="#/course/x" {...extra} />
);

beforeEach(() => {
  files.clear();
  platform.native = false;
  rendered.length = 0;
  Object.assign(parse, { reject: false, started: false, pending: null });
  Object.values(fs).forEach((f) => f.mockReset());
  http.get.mockReset();
  fs.deleteFile.mockResolvedValue(undefined);
  fs.readFile.mockImplementation(async ({ path }) => {
    if (!files.has(path)) throw new Error('missing');
    return { data: files.get(path) };
  });
  fs.writeFile.mockImplementation(async ({ path, data }) => void files.set(path, data));
  pdfDoc.getPage.mockImplementation(async (n: number) => ({
    getViewport: ({ scale }: { scale: number }) => ({ width: 100 * scale, height: 150 * scale }),
    render: () => {
      rendered.push(n);
      return { promise: Promise.resolve(), cancel: vi.fn() };
    },
  }));
  HTMLCanvasElement.prototype.getContext = vi.fn() as never;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('getPdf in the mobile app', () => {
  beforeEach(() => {
    platform.native = true;
  });

  it('serves a cached file without touching the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    files.set(`pdf/${await sha(url)}.pdf`, b64);
    const out = await getPdf(file);
    expect([...out]).toEqual([...bytes]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(http.get).not.toHaveBeenCalled();
  });

  it('downloads al-badr.net directly on a miss and stores it for the next open', async () => {
    http.get.mockResolvedValue({ status: 200, data: b64 });
    const out = await getPdf(file);
    expect([...out]).toEqual([...bytes]);
    expect(http.get).toHaveBeenCalledWith({ url, responseType: 'blob' });
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    expect(fs.writeFile.mock.calls[0][0]).toMatchObject({ data: b64, directory: 'DATA', recursive: true });
  });

  it('rejects on a non-200 response and caches nothing', async () => {
    http.get.mockResolvedValue({ status: 404, data: '' });
    await expect(getPdf(file)).rejects.toThrow();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('dropPdf removes the cached copy', async () => {
    await dropPdf(file);
    expect(fs.deleteFile).toHaveBeenCalledWith({ path: `pdf/${await sha(url)}.pdf`, directory: 'DATA' });
  });
});

describe('getPdf in a browser', () => {
  it('reads the book through the API proxy, never al-badr.net, and keeps no file copy', async () => {
    const fetchMock = vi.fn(async (..._: unknown[]) => new Response(bytes));
    vi.stubGlobal('fetch', fetchMock);
    const out = await getPdf({ ...file, index: 2 });
    expect([...out]).toEqual([...bytes]);
    expect(fetchMock).toHaveBeenCalledWith(`https://api.albadrmubasher.com/api/courses/${course.id}/pdf/2`);
    expect(http.get).not.toHaveBeenCalled();
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('rejects when the proxy refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 502 })));
    await expect(getPdf(file)).rejects.toThrow();
  });

  it('builds the proxy URL from the course id and volume index', () => {
    expect(proxyUrl({ courseId: 'a b', index: 1, url })).toBe('https://api.albadrmubasher.com/api/courses/a%20b/pdf/1');
  });

  it('dropPdf has nothing to remove', async () => {
    await dropPdf(file);
    expect(fs.deleteFile).not.toHaveBeenCalled();
  });
});

describe('Book', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes)));
  });

  it('opens at the requested page and shows the indicator', async () => {
    render(book(10));
    await screen.findByText('ص ١٠ / ٢٠');
    await waitFor(() => expect(rendered).toEqual([10]));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('the back arrow returns to the page the reader came from, not always the course page', async () => {
    const back = vi.spyOn(history, 'back').mockImplementation(() => {});
    history.replaceState(null, '', '#/');
    trackEntry();
    history.pushState(null, '', '#/book/x/0/10');
    trackEntry();
    render(book(10, false, { back: '#/' }));
    const arrow = screen.getByRole('link', { name: 'رجوع' });
    expect(arrow.getAttribute('href')).toBe('#/');
    fireEvent.click(arrow);
    expect(back).toHaveBeenCalledOnce();
    back.mockRestore();
  });

  it('draws the page on a left-to-right canvas, since pdf.js positions every glyph from its left edge', async () => {
    render(book(10));
    await waitFor(() => expect(rendered).toEqual([10]));
    expect(document.querySelector('canvas')!.getAttribute('dir')).toBe('ltr');
  });

  it('shows the printed page number when the PDF has front matter, still opening the PDF page asked for', async () => {
    render(book(10, true, { course: { ...course, pageOffsets: [2], next: { ...course.next!, startPage: 10, estEndPage: 12 } } }));
    await screen.findByText('ص ٨ / ١٨');
    await waitFor(() => expect(rendered).toEqual([10]));
    expect(document.querySelector('.pdfbar .pill')!.textContent).toBe('ص ٨');
    expect(screen.getByText('ص ٨ إلى نحو ١٠')).toBeTruthy();
  });

  it('a front-matter page has no printed number', async () => {
    render(book(2, false, { course: { ...course, pageOffsets: [2] } }));
    await screen.findByText('ص — / ١٨');
    expect(document.querySelector('.pdfbar .pill')).toBeNull();
  });

  it('clamps a page beyond the total to the last page', async () => {
    render(book(500));
    await screen.findByText('ص ٢٠ / ٢٠');
    await waitFor(() => expect(rendered).toEqual([20]));
  });

  it('arrows move between pages and swipe right goes to the next page', async () => {
    render(book(10));
    await screen.findByText('ص ١٠ / ٢٠');
    fireEvent.click(screen.getByRole('button', { name: 'الصفحة التالية' }));
    await screen.findByText('ص ١١ / ٢٠');
    const wrap = document.querySelector('.pdfwrap')!;
    fireEvent.touchStart(wrap, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(wrap, { changedTouches: [{ clientX: 200, clientY: 105 }] });
    await screen.findByText('ص ١٢ / ٢٠');
    fireEvent.click(screen.getByRole('button', { name: 'الصفحة السابقة' }));
    await screen.findByText('ص ١١ / ٢٠');
  });

  it('shows the marker banner only when opened from a prepare item', async () => {
    const { unmount } = render(book(10, true));
    await screen.findByText('بداية الدرس تقريبًا');
    unmount();
    render(book(10));
    await screen.findByText('ص ١٠ / ٢٠');
    expect(screen.queryByText('بداية الدرس تقريبًا')).toBeNull();
  });

  it('footer قرأتُه ticks the next lesson read', async () => {
    const onTick = vi.fn();
    render(book(10, true, { onTick }));
    fireEvent.click(await screen.findByRole('button', { name: 'قرأتُه' }));
    expect(onTick).toHaveBeenCalledWith('read', course.id, course.next!.number);
  });

  it('footer tick shows without the marker too', async () => {
    render(book(10));
    await screen.findByRole('button', { name: 'قرأتُه' });
  });

  it('a new requested page moves the viewer', async () => {
    const { rerender } = render(book(10));
    await screen.findByText('ص ١٠ / ٢٠');
    rerender(book(15));
    await screen.findByText('ص ١٥ / ٢٠');
  });

  it('re-renders the page at the new width when the window resizes, capped for wide screens', async () => {
    let resized: () => void = () => {};
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: () => void) {
        resized = cb;
      }
      observe() {}
      disconnect() {}
    });
    render(book(10));
    await waitFor(() => expect(rendered).toEqual([10]));
    const wrap = document.querySelector('.pdfwrap') as HTMLElement;
    Object.defineProperty(wrap, 'clientWidth', { configurable: true, value: 1600 });
    act(() => resized());
    await waitFor(() => expect(rendered).toEqual([10, 10]));
    const canvas = document.querySelector('canvas')!;
    expect(canvas.width / (devicePixelRatio || 1)).toBe(900);
  });

  it('the native app (tablets) uses the full width, without the desktop cap', async () => {
    platform.native = true;
    http.get.mockResolvedValue({ status: 200, data: b64 });
    let resized: () => void = () => {};
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: () => void) {
        resized = cb;
      }
      observe() {}
      disconnect() {}
    });
    render(book(10));
    await waitFor(() => expect(rendered).toEqual([10]));
    Object.defineProperty(document.querySelector('.pdfwrap'), 'clientWidth', { configurable: true, value: 1600 });
    act(() => resized());
    await waitFor(() => expect(rendered).toEqual([10, 10]));
    expect(document.querySelector('canvas')!.width / (devicePixelRatio || 1)).toBe(1572);
  });

  it('a render failure surfaces the error state', async () => {
    pdfDoc.getPage.mockRejectedValue(new Error('boom'));
    render(book(10));
    await screen.findByText('تعذّر تحميل الكتاب');
  });

  it('parse failure on valid PDF bytes keeps the cached copy', async () => {
    parse.reject = true;
    render(book(10));
    await screen.findByText('تعذّر تحميل الكتاب');
    expect(fs.deleteFile).not.toHaveBeenCalled();
  });

  it('parse failure on invalid bytes drops the cached copy and shows the error', async () => {
    platform.native = true;
    http.get.mockResolvedValue({ status: 200, data: btoa('<html') });
    parse.reject = true;
    render(book(10));
    await screen.findByText('تعذّر تحميل الكتاب');
    expect(fs.deleteFile).toHaveBeenCalledTimes(1);
  });

  it('leaving during parse keeps the cached copy', async () => {
    let fail!: (e: Error) => void;
    parse.pending = new Promise((_, rej) => (fail = rej));
    const { unmount } = render(book(10));
    await waitFor(() => expect(parse.started).toBe(true));
    unmount();
    await new Promise((r) => setTimeout(r, 20));
    fail(new Error('destroyed'));
    await new Promise((r) => setTimeout(r, 20));
    expect(fs.deleteFile).not.toHaveBeenCalled();
  });

  it('download error shows retry and the original link, and retry recovers', async () => {
    let offline = true;
    vi.stubGlobal('fetch', vi.fn(async () => (offline ? Promise.reject(new Error('net')) : new Response(bytes))));
    render(book(10));
    await screen.findByText('تعذّر تحميل الكتاب');
    expect(screen.getByRole('link', { name: 'افتح في المتصفح' }).getAttribute('href')).toBe(url);
    offline = false;
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' })));
    await screen.findByText('ص ١٠ / ٢٠');
  });
});

async function sha(s: string) {
  const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
