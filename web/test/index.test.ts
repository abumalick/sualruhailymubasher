import { describe, expect, it, vi } from 'vitest';
import { canonicalUrl, handle } from '../src/index';

const assets = (res = new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })) => ({ fetch: vi.fn(async (_: unknown) => res) });

describe('canonicalUrl', () => {
  it('sends www to the apex, keeping path and query', () => {
    expect(canonicalUrl('https://www.albadrmubasher.com/privacy?x=1')).toBe('https://albadrmubasher.com/privacy?x=1');
    expect(canonicalUrl('http://www.albadrmubasher.com/')).toBe('https://albadrmubasher.com/');
  });

  it('leaves the apex and the preview host alone', () => {
    expect(canonicalUrl('https://albadrmubasher.com/')).toBeNull();
    expect(canonicalUrl('https://albadr-web-preview.abdullah-hilson-9ab.workers.dev/')).toBeNull();
  });
});

describe('handle', () => {
  it('redirects www permanently without touching the assets', async () => {
    const a = assets();
    const res = await handle(new Request('https://www.albadrmubasher.com/privacy'), a);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://albadrmubasher.com/privacy');
    expect(a.fetch).not.toHaveBeenCalled();
  });

  it('serves the asset with nosniff and a referrer policy', async () => {
    const a = assets();
    const req = new Request('https://albadrmubasher.com/');
    const res = await handle(req, a);
    expect(a.fetch).toHaveBeenCalledWith(req);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<!doctype html>');
    expect(res.headers.get('content-type')).toBe('text/html');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });

  it('passes the assets status through (a missing page stays a 404)', async () => {
    const res = await handle(new Request('https://albadrmubasher.com/nope'), assets(new Response('nf', { status: 404 })));
    expect(res.status).toBe(404);
  });
});
