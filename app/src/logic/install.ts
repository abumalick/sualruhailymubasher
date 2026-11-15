import { STORES } from '../site';

export type StoreId = 'play' | 'appstore';

export interface Visitor {
  nativeUI: boolean;
  ua: string;
  maxTouchPoints: number;
  dismissed: boolean;
}

// iPadOS Safari sends a Mac user agent; only the touch screen tells it apart from a Mac.
const isIOS = (ua: string, maxTouchPoints: number) => /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);

// No Smart App Banner meta in index.html: page script can't tell whether Safari shows it or the visitor closed it,
// so pairing it with this banner risks two banners or none. iOS Safari gets this banner like every other browser.
export function installStores({ nativeUI, ua, maxTouchPoints, dismissed }: Visitor): StoreId[] | null {
  if (nativeUI || dismissed) return null;
  if (/Android/.test(ua)) return ['play'];
  if (isIOS(ua, maxTouchPoints)) return ['appstore'];
  return ['play', 'appstore'];
}

// Stores that have a listing; an iOS visitor gets none until the App Store id is set in site.ts.
export const listedStores = (ids: StoreId[]): StoreId[] => ids.filter((id) => STORES.some((s) => s.id === id));
