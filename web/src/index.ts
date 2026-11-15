export interface Env {
  ASSETS: Fetcher;
}

// www.sualruhailymubasher.com answers with a permanent redirect to the apex, keeping path and query.
export function canonicalUrl(raw: string): string | null {
  const url = new URL(raw);
  if (!url.hostname.startsWith('www.')) return null;
  url.hostname = url.hostname.slice('www.'.length);
  url.protocol = 'https:';
  return url.toString();
}

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'strict-transport-security': 'max-age=31536000',
  'content-security-policy': "frame-ancestors 'none'",
};

export async function handle(request: Request, assets: Pick<Fetcher, 'fetch'>): Promise<Response> {
  const target = canonicalUrl(request.url);
  if (target) return Response.redirect(target, 301);
  const res = await assets.fetch(request);
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  return out;
}

export default {
  fetch: (request: Request, env: Env) => handle(request, env.ASSETS),
} satisfies ExportedHandler<Env>;
