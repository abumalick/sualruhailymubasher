// Display name (home screen, About). The full store title is in index.html <title>; public/privacy.html repeats both.
export const APP_NAME = 'البدر مباشر';
export const CONTACT_EMAIL = 'contact@albadrmubasher.com';
export const SITE = 'https://albadrmubasher.com';
export const PRIVACY_URL = `${SITE}/privacy`;
export const MIXLR_URL = 'https://albadrnet.mixlr.com';
export const SHEIKH_SITE = 'https://al-badr.net';

// null until the listing is live; the page then says «قريبًا» instead of linking.
export const STORES: { name: string; url: string | null }[] = [
  { name: 'Google Play', url: null },
  { name: 'App Store', url: null },
];
