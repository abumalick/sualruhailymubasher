export interface PdfDeps {
  fetch: typeof fetch;
  cache: Pick<Cache, 'match' | 'put'>;
  waitUntil: (p: Promise<unknown>) => void;
}

// One day: a corrected edition published under the same URL reaches readers by the next day.
const MAX_AGE = 24 * 3600;

export function isBookUrl(raw: string | undefined): raw is string {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === 'al-badr.net' && url.pathname.toLowerCase().endsWith('.pdf') && !url.username && !url.port;
  } catch {
    return false;
  }
}

// Browsers cannot fetch al-badr.net PDFs directly (no CORS headers), so the web app reads them through here.
// Callers pass a URL taken from the course data, never one from the request.
export async function servePdf(url: string, deps: PdfDeps): Promise<Response> {
  if (!isBookUrl(url)) return new Response('not found', { status: 404 });
  const key = new Request(url);
  const hit = await deps.cache.match(key);
  if (hit) return new Response(hit.body, hit);

  let upstream: Response;
  try {
    upstream = await deps.fetch(url, { redirect: 'manual' });
  } catch (e) {
    console.error('pdf upstream unreachable', url, e);
    return new Response('upstream unreachable', { status: 502 });
  }
  const type = upstream.headers.get('content-type') ?? '';
  if (upstream.status !== 200 || !type.toLowerCase().startsWith('application/pdf') || !upstream.body) {
    console.error('pdf upstream refused', url, upstream.status, type);
    await upstream.body?.cancel();
    return new Response('upstream error', { status: 502 });
  }

  const headers = new Headers({ 'content-type': 'application/pdf', 'cache-control': `public, max-age=${MAX_AGE}` });
  const length = upstream.headers.get('content-length');
  if (length) headers.set('content-length', length);
  const [toClient, toCache] = upstream.body.tee();
  deps.waitUntil(deps.cache.put(key, new Response(toCache, { headers })).catch((e) => console.error('pdf cache put failed', e)));
  return new Response(toClient, { headers });
}
