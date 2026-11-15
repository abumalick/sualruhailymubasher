import { APP_NAME, SITE } from '../site';

export type ShareMethod = 'native' | 'web' | 'copy' | 'none';
export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'failed';
export interface ShareMessage {
  title: string;
  text: string;
  url: string;
}

export function shareMethod({ native, webShare, clipboard }: { native: boolean; webShare: boolean; clipboard: boolean }): ShareMethod {
  if (native) return 'native';
  if (webShare) return 'web';
  return clipboard ? 'copy' : 'none';
}

// The text leaves the link out: the Android share sheet and most Web Share targets append the url to it.
export const shareMessage = (): ShareMessage => ({
  title: APP_NAME,
  text: `تطبيق ${APP_NAME}: البث المباشر لدروس الشيخ سليمان الرحيلي في المسجد النبوي وتسجيلاتها، مع موضع كل درس في الكتاب.`,
  url: SITE,
});

// A dismissed sheet rejects with AbortError on the web and with "Share canceled" from @capacitor/share.
export function isCancel(err: unknown): boolean {
  if (!(err instanceof Error) && !(err instanceof DOMException)) return false;
  return err.name === 'AbortError' || err.message === 'Share canceled';
}

export function shareHint(outcome: ShareOutcome): string | null {
  if (outcome === 'copied') return 'نُسخ الرابط، ألصقه في محادثة';
  if (outcome === 'failed') return `تعذّرت المشاركة، الرابط: ${SITE.replace('https://', '')}`;
  return null;
}
