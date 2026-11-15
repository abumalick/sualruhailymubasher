import type { StoreId } from './logic/install';

// Display name (home screen, About). The full store title is in index.html <title>; public/privacy.html repeats both.
export const APP_NAME = 'سليمان الرحيلي مباشر';
export const CONTACT_EMAIL = 'contact@sualruhailymubasher.com';
export const SITE = 'https://sualruhailymubasher.com';
export const PRIVACY_URL = `${SITE}/privacy`;
export const MIXLR_URL = 'https://sualruhaily.mixlr.com';
export const SHEIKH_SITE = 'https://sualruhaily.com';

// Set once the iOS app is on the App Store; until then no iOS badge or link is shown.
const APP_STORE_ID: string | null = null;

// The App Store link names no country, so Apple sends each visitor to their own storefront.
export const STORES: { id: StoreId; name: string; url: string }[] = [
  { id: 'play', name: 'Google Play', url: 'https://play.google.com/store/apps/details?id=com.sualruhailymubasher.app' },
  ...(APP_STORE_ID ? [{ id: 'appstore' as const, name: 'App Store', url: `https://apps.apple.com/app/id${APP_STORE_ID}` }] : []),
];
