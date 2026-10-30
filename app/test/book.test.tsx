import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const files = new Map<string, string>();
const fs = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
}));
vi.mock('@capacitor/filesystem', () => ({ Directory: { Data: 'DATA' }, Filesystem: fs }));
const http = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@capacitor/core', async (orig) => ({
  ...(await orig<typeof import('@capacitor/core')>()),
  CapacitorHttp: http,
}));

const rendered: number[] = [];
const pdfDoc = vi.hoisted(() => ({ numPages: 20, destroy: vi.fn(), getPage: vi.fn() }));
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({ promise: Promise.resolve(pdfDoc), destroy: vi.fn() }),
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }));

import { FIXTURE_STATE } from '../src/dev/fixture-state';
import { getPdf, dropPdf } from '../src/pdf/cache';
import { Book } from '../src/ui/Book';

const course = FIXTURE_STATE.courses[0];
const url = course.pdfUrls[0];
const none = { read: new Set<string>(), reviewed: new Set<string>() };
const bytes = new Uint8Array([37, 80, 68, 70]);
const b64 = btoa(String.fromCharCode(...bytes));

const book = (page: number, marker = false, extra = {}) => (
  <Book course={course} pdfIndex={0} page={page} marker={marker} ticks={none} onTick={vi.fn()} {...extra} />
);

beforeEach(() => {
  files.clear();
  rendered.length = 0;
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

describe('getPdf', () => {
  it('serves a cached file without touching the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    files.set(`pdf/${await sha(url)}.pdf`, b64);
    const out = await getPdf(url);
    expect([...out]).toEqual([...bytes]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(http.get).not.toHaveBeenCalled();
  });

  it('downloads on a miss and stores it for the next open', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes)));
    const out = await getPdf(url);
    expect([...out]).toEqual([...bytes]);
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    expect(fs.writeFile.mock.calls[0][0]).toMatchObject({ data: b64, directory: 'DATA', recursive: true });
  });

  it('rejects on a non-200 response and caches nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 404 })));
    await expect(getPdf(url)).rejects.toThrow();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('dropPdf removes the cached copy', async () => {
    await dropPdf(url);
    expect(fs.deleteFile).toHaveBeenCalledWith({ path: `pdf/${await sha(url)}.pdf`, directory: 'DATA' });
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
    await screen.findByText('بداية الدرس القادم تقريبًا');
    unmount();
    render(book(10));
    await screen.findByText('ص ١٠ / ٢٠');
    expect(screen.queryByText('بداية الدرس القادم تقريبًا')).toBeNull();
  });

  it('footer قرأتُه ticks the next lesson read', async () => {
    const onTick = vi.fn();
    render(book(10, true, { onTick }));
    fireEvent.click(await screen.findByRole('button', { name: 'قرأتُه' }));
    expect(onTick).toHaveBeenCalledWith('read', course.id, course.next!.number);
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
