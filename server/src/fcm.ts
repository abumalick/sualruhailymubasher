import type { PushData } from '@albadr/shared';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

export interface Notification {
  title: string;
  body: string;
  data?: PushData;
}

const encoder = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importKey(pem: string): Promise<CryptoKey> {
  const der = Uint8Array.from(atob(pem.replace(/-----(BEGIN|END) PRIVATE KEY-----|\s/g, '')), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

async function signJwt(sa: ServiceAccount, key: CryptoKey, nowSec: number): Promise<string> {
  const header = b64url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = b64url(
    encoder.encode(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowSec, exp: nowSec + 3600 })),
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(`${header}.${claims}`));
  return `${header}.${claims}.${b64url(signature)}`;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, Promise<CachedToken>>();

export function createFcm(serviceAccountJson: string, f: typeof fetch) {
  let account: { sa: ServiceAccount; key: Promise<CryptoKey> } | null = null;

  function loadAccount() {
    if (!account) {
      const sa = JSON.parse(serviceAccountJson) as ServiceAccount;
      account = { sa, key: importKey(sa.private_key) };
    }
    return account;
  }

  async function requestToken(): Promise<CachedToken> {
    const { sa, key } = loadAccount();
    const now = Date.now();
    const res = await f(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: await signJwt(sa, await key, Math.floor(now / 1000)),
      }).toString(),
    });
    if (!res.ok) throw new Error(`FCM token request failed: ${res.status} ${await res.text()}`);
    const { access_token, expires_in } = (await res.json()) as { access_token: string; expires_in: number };
    return { token: access_token, expiresAt: now + expires_in * 1000 };
  }

  async function accessToken(email: string): Promise<string> {
    const existing = tokenCache.get(email);
    if (existing) {
      try {
        const cached = await existing;
        if (cached.expiresAt - 60_000 > Date.now()) return cached.token;
      } catch {
        // the failing request evicts itself below; fall through and retry
      }
    }
    const pending = requestToken();
    tokenCache.set(email, pending);
    try {
      return (await pending).token;
    } catch (e) {
      if (tokenCache.get(email) === pending) tokenCache.delete(email);
      throw e;
    }
  }

  return {
    async sendToTopic(topic: string, n: Notification): Promise<void> {
      if (!serviceAccountJson) {
        console.warn('FCM disabled: no service account configured');
        return;
      }
      const { sa } = loadAccount();
      const res = await f(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST',
        headers: { authorization: `Bearer ${await accessToken(sa.client_email)}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: {
            topic,
            notification: { title: n.title, body: n.body },
            data: n.data,
            android: { priority: 'high', notification: { channel_id: 'lessons' } },
            apns: { payload: { aps: { sound: 'default' } } },
          },
        }),
      });
      if (!res.ok) throw new Error(`FCM send failed: ${res.status} ${await res.text()}`);
    },
  };
}

export type Fcm = ReturnType<typeof createFcm>;
