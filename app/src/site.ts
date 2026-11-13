import type { StoreId } from './logic/install';

// Display name (home screen, About). The full store title is in index.html <title>; public/privacy.html repeats both.
export const APP_NAME = 'البدر مباشر';
export const CONTACT_EMAIL = 'contact@albadrmubasher.com';
export const SITE = 'https://albadrmubasher.com';
export const PRIVACY_URL = `${SITE}/privacy`;
export const MIXLR_URL = 'https://albadrnet.mixlr.com';
export const SHEIKH_SITE = 'https://al-badr.net';

// The App Store link names no country, so Apple sends each visitor to their own storefront.
export const STORES: { id: StoreId; name: string; url: string }[] = [
  { id: 'play', name: 'Google Play', url: 'https://play.google.com/store/apps/details?id=com.albadrmubasher.app' },
  { id: 'appstore', name: 'App Store', url: 'https://apps.apple.com/app/id6832876968' },
];
