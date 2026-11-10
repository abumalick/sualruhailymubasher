export const SITE = 'https://albadrmubasher.com';
export const PRIVACY_URL = `${SITE}/privacy`;
export const MIXLR_URL = 'https://albadrnet.mixlr.com';
export const SHEIKH_SITE = 'https://al-badr.net';

// null until the listing is live; the page then says «قريبًا» instead of linking.
export const STORES: { name: string; url: string | null }[] = [
  { name: 'Google Play', url: null },
  { name: 'App Store', url: null },
];
