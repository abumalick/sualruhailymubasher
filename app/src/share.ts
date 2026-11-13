import { Share } from '@capacitor/share';
import { isCancel, shareMessage, shareMethod, type ShareMessage, type ShareOutcome } from './logic/share';
import { isNative } from './platform';

export interface ShareEnv {
  native: boolean;
  nativeShare: (m: ShareMessage) => Promise<unknown>;
  webShare?: (m: ShareMessage) => Promise<void>;
  copy?: (text: string) => Promise<void>;
}

export function deviceShareEnv(): ShareEnv {
  return {
    native: isNative(),
    nativeShare: (m) => Share.share({ ...m, dialogTitle: 'شارك التطبيق' }),
    webShare: typeof navigator.share === 'function' ? (m) => navigator.share(m) : undefined,
    copy: navigator.clipboard?.writeText ? (t) => navigator.clipboard.writeText(t) : undefined,
  };
}

async function copyLink(env: ShareEnv, url: string): Promise<ShareOutcome> {
  if (!env.copy) return 'failed';
  try {
    await env.copy(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

// Stays synchronous up to the share call: Safari drops the tap's user activation after an await.
export async function shareApp(env: ShareEnv): Promise<ShareOutcome> {
  const m = shareMessage();
  const method = shareMethod({ native: env.native, webShare: !!env.webShare, clipboard: !!env.copy });
  if (method === 'copy' || method === 'none') return copyLink(env, m.url);
  try {
    await (method === 'native' ? env.nativeShare(m) : env.webShare!(m));
    return 'shared';
  } catch (err) {
    return isCancel(err) ? 'cancelled' : copyLink(env, m.url);
  }
}
