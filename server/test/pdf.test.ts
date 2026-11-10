import { env, exports } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { upsertCourse } from '../src/repo';
import { isBookUrl, servePdf, type PdfDeps } from '../src/pdf';

const BOOK = 'https://al-badr.net/download/mutun/SharhKitaabAtTawheed_IbnIbraheem_01.pdf';
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

function fakeCache() {
  const store = new Map<string, Response>();
  return {
    store,
    match: vi.fn(async (req: RequestInfo) => {
      const hit = store.get(typeof req === 'string' ? req : req.url);
      return hit?.clone();
    }),
    put: vi.fn(async (req: RequestInfo, res: Response) => {
      const body = await res.arrayBuffer();
      store.set(typeof req === 'string' ? req : req.url, new Response(body, res));
    }),
  };
}

function deps(upstream: () => Promise<Response>) {
  const cache = fakeCache();
  const pending: Promise<unknown>[] = [];
  const fetch = vi.fn(async (..._: unknown[]) => upstream());
  const d: PdfDeps = { fetch: fetch as unknown as typeof globalThis.fetch, cache: cache as unknown as PdfDeps['cache'], waitUntil: (p) => void pending.push(p) };
  return { d, cache, fetch, settle: () => Promise.all(pending) };
}

const pdfResponse = (init: ResponseInit = {}) =>
  new Response(PDF, { status: 200, headers: { 'content-type': 'application/pdf', 'content-length': String(PDF.length), 'set-cookie': 'x=1' }, ...init });

describe('isBookUrl', () => {
  it('accepts the al-badr.net PDFs the courses reference', () => {
    expect(isBookUrl(BOOK)).toBe(true);
    expect(isBookUrl('https://al-badr.net/download/mutun/x.PDF')).toBe(true);
  });

  it.each([
    ['plain http', 'http://al-badr.net/download/mutun/a.pdf'],
    ['another host', 'https://evil.example/a.pdf'],
    ['a look-alike host', 'https://al-badr.net.evil.example/a.pdf'],
    ['a subdomain', 'https://x.al-badr.net/a.pdf'],
    ['credentials', 'https://user@al-badr.net/a.pdf'],
    ['a port', 'https://al-badr.net:8443/a.pdf'],
    ['not a pdf', 'https://al-badr.net/download/esound/a.mp3'],
    ['garbage', 'not a url'],
    ['nothing', undefined],
  ])('refuses %s', (_, url) => {
    expect(isBookUrl(url)).toBe(false);
  });
});

describe('servePdf', () => {
  it('streams the PDF from al-badr.net without following redirects, and caches it', async () => {
    const { d, cache, fetch, settle } = deps(async () => pdfResponse());
    const res = await servePdf(BOOK, d);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-length')).toBe(String(PDF.length));
    expect(res.headers.get('cache-control')).toBe('public, max-age=604800');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);
    expect(fetch).toHaveBeenCalledWith(BOOK, { redirect: 'manual' });
    await settle();
    expect(cache.store.has(BOOK)).toBe(true);
  });

  it('answers from the cache without calling al-badr.net again', async () => {
    const { d, fetch, settle } = deps(async () => pdfResponse());
    await (await servePdf(BOOK, d)).arrayBuffer();
    await settle();
    const res = await servePdf(BOOK, d);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a redirect', () => new Response(null, { status: 302, headers: { location: 'https://evil.example/a.pdf' } })],
    ['an error page', () => new Response('<html>oops</html>', { status: 500, headers: { 'content-type': 'text/html' } })],
    ['an HTML page with 200', () => new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/html' } })],
  ])('refuses %s from upstream and caches nothing', async (_, make) => {
    const { d, cache, settle } = deps(async () => make());
    const res = await servePdf(BOOK, d);
    expect(res.status).toBe(502);
    await settle();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('reports an unreachable upstream as 502', async () => {
    const { d } = deps(async () => {
      throw new Error('network');
    });
    expect((await servePdf(BOOK, d)).status).toBe(502);
  });

  it('never fetches a URL outside al-badr.net', async () => {
    const { d, fetch } = deps(async () => pdfResponse());
    expect((await servePdf('https://evil.example/a.pdf', d)).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('GET /api/courses/:id/pdf/:index', () => {
  const get = (path: string) => exports.default.fetch(`http://example.com${path}`, { headers: { origin: 'https://albadrmubasher.com' } });
  const upstream = vi.fn(async (..._: unknown[]) => pdfResponse());

  afterEach(() => {
    vi.unstubAllGlobals();
    upstream.mockClear();
  });

  it('serves a volume the course data lists, with CORS, and serves the cached copy afterwards', async () => {
    vi.stubGlobal('fetch', upstream);
    const res = await get('/api/courses/kitab-tawhid/pdf/1');
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);
    expect(upstream).toHaveBeenCalledWith('https://al-badr.net/download/mutun/SharhKitaabAtTawheed_IbnIbraheem_02.pdf', { redirect: 'manual' });

    const again = await get('/api/courses/kitab-tawhid/pdf/1');
    expect(again.status).toBe(200);
    expect(again.headers.get('access-control-allow-origin')).toBe('*');
    expect(new Uint8Array(await again.arrayBuffer())).toEqual(PDF);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an unknown course', '/api/courses/nope/pdf/0'],
    ['a course without a PDF', '/api/courses/tafsir-saadi/pdf/0'],
    ['an index past the last volume', '/api/courses/kitab-tawhid/pdf/3'],
    ['a negative index', '/api/courses/kitab-tawhid/pdf/-1'],
    ['a fractional index', '/api/courses/kitab-tawhid/pdf/0.5'],
    ['a non-numeric index', '/api/courses/kitab-tawhid/pdf/x'],
  ])('answers 404 for %s without fetching anything', async (_, path) => {
    vi.stubGlobal('fetch', upstream);
    expect((await get(path)).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('refuses a course PDF URL that is not on al-badr.net', async () => {
    vi.stubGlobal('fetch', upstream);
    await upsertCourse(env.DB, 'odd', { title: 'x', slot: 'fajr', weekdays: [0], offsetMin: 0, seriesId: 1, pdfUrls: ['https://evil.example/a.pdf'], active: true });
    expect((await get('/api/courses/odd/pdf/0')).status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
    await env.DB.prepare("DELETE FROM courses WHERE id = 'odd'").run();
  });
});
