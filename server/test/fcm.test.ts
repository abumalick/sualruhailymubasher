import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFcm } from '../src/fcm';

const b64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const b64urlDecode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

let publicKey: CryptoKey;
let pem: string;
let n = 0;
const account = () =>
  JSON.stringify({ client_email: `sa${++n}@proj.iam.gserviceaccount.com`, private_key: pem, project_id: 'proj-123' });

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  publicKey = pair.publicKey;
  const pkcs8 = b64(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
});

function mockFetch(sendStatus = 200) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') {
      return Response.json({ access_token: 'tok-1', expires_in: 3600 });
    }
    return new Response(sendStatus === 200 ? '{"name":"x"}' : 'boom', { status: sendStatus });
  });
}

const note = { title: 't', body: 'b', data: { kind: 'live' } };

describe('fcm', () => {
  afterEach(() => vi.useRealTimers());

  it('requests a token with a verifiable RS256 JWT', async () => {
    const f = mockFetch();
    await createFcm(account(), f).sendToTopic('c-tafsir-saadi-live', note);
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toBe('https://oauth2.googleapis.com/token');
    const form = new URLSearchParams(String(init!.body));
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const [h, p, s] = form.get('assertion')!.split('.');
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h!)))).toEqual({ alg: 'RS256', typ: 'JWT' });
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p!)));
    expect(claims).toMatchObject({
      iss: expect.stringMatching(/^sa\d+@proj\.iam\.gserviceaccount\.com$/),
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
    });
    expect(claims.exp - claims.iat).toBe(3600);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, b64urlDecode(s!), new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });

  it('caches the token across sends', async () => {
    const f = mockFetch();
    const fcm = createFcm(account(), f);
    await fcm.sendToTopic('c-tafsir-saadi-live', note);
    await fcm.sendToTopic('c-tafsir-saadi-live', note);
    const tokenCalls = f.mock.calls.filter(([u]) => String(u) === 'https://oauth2.googleapis.com/token');
    expect(tokenCalls).toHaveLength(1);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('shares the token across instances and concurrent sends', async () => {
    const f = mockFetch();
    const sa = account();
    await Promise.all([createFcm(sa, f), createFcm(sa, f), createFcm(sa, f)].map((c) => c.sendToTopic('x', note)));
    expect(f.mock.calls.filter(([u]) => String(u) === 'https://oauth2.googleapis.com/token')).toHaveLength(1);
  });

  it('requests a new token within 60 s of expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const f = mockFetch();
    const fcm = createFcm(account(), f);
    await fcm.sendToTopic('x', note);
    vi.setSystemTime(new Date('2026-01-01T00:58:00Z'));
    await fcm.sendToTopic('x', note);
    expect(f.mock.calls.filter(([u]) => String(u) === 'https://oauth2.googleapis.com/token')).toHaveLength(1);
    vi.setSystemTime(new Date('2026-01-01T00:59:30Z'));
    await fcm.sendToTopic('x', note);
    expect(f.mock.calls.filter(([u]) => String(u) === 'https://oauth2.googleapis.com/token')).toHaveLength(2);
  });

  it('posts the message to the project topic', async () => {
    const f = mockFetch();
    await createFcm(account(), f).sendToTopic('c-tafsir-saadi-live', note);
    const [url, init] = f.mock.calls[1]!;
    expect(String(url)).toBe('https://fcm.googleapis.com/v1/projects/proj-123/messages:send');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer tok-1');
    expect(JSON.parse(String(init!.body))).toEqual({
      message: {
        topic: 'c-tafsir-saadi-live',
        notification: { title: 't', body: 'b' },
        data: { kind: 'live' },
        android: { priority: 'high', notification: { channel_id: 'lessons' } },
        apns: { payload: { aps: { sound: 'default' } } },
      },
    });
  });

  it('rejects on a non-2xx send', async () => {
    await expect(createFcm(account(), mockFetch(500)).sendToTopic('x', note)).rejects.toThrow(/500.*boom/);
  });

  it('is a no-op when no service account is configured', async () => {
    const f = mockFetch();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await createFcm('', f).sendToTopic('x', note);
    expect(f).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('FCM disabled'));
    warn.mockRestore();
  });
});
