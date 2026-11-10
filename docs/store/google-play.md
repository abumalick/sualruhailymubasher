# Google Play listing

Package `com.albadrmubasher.app`, developer account "H2 Alliance" (organisation account). Default language
Arabic (ar), with an English (en-US) translation.

## Store listing

The listing lives in `fastlane/metadata/android/` and is uploaded by fastlane (see `app/README.md`):
titles, short and full descriptions per locale, changelogs per versionCode, and the images under
`ar/images/` (icon, feature graphic, phone screenshots). Screenshots come from `scripts/store-screenshots.sh android`
(the apps' screens with real lessons, 1080x1920), the same generator as the App Store's. Home-screen label: البدر مباشر.

**Category**: Education. **Tags**: chosen in the console. **Contact email**: contact@albadrmubasher.com.
**Privacy policy**: https://albadrmubasher.com/privacy (must load before the app is submitted for review)

## App content answers

Checked against the code (`app/src/api.ts`, `app/src/push.ts`, the merged manifest):

- **Privacy policy**: the URL above.
- **Ads**: no ads.
- **App access**: all functionality is available without special access (no login).
- **Content rating** (IARC questionnaire): category "Reference, News, or Educational"; no violence, sexual
  content, profanity, drugs, gambling; no user-generated content or user interaction; no location sharing;
  no purchases. Expected rating: Everyone / PEGI 3.
- **Target audience**: 18 and over (also suitable for all, but declaring under-13 audiences triggers the
  Families policy; the app is aimed at adult students). Not designed for children.
- **News app**: no. **Government app**: no. **Financial features**: none. **Health**: no.
- **Advertising ID**: the app does not use it (no `AD_ID` permission in the merged manifest).
- **Data safety**:
  - Data collected: **Device or other IDs**. Firebase Cloud Messaging uses the Firebase installation ID
    and registration token to deliver notifications. Collected, not shared; purpose App functionality;
    processed ephemerally: no; required (users can turn notifications off but the SDK still registers).
  - Nothing else: no account, no personal info, no location, no contacts, no analytics, no crash reporting.
    The app reads `/api/state` and `/api/courses/:id/lessons` without sending identifiers, never reads or
    uploads its FCM token, subscribes to topics on the device, and keeps lesson choices in local storage.
  - Data encrypted in transit: yes (HTTPS / FCM).
  - Account deletion: not applicable (no accounts).
  - Third-party content: the live stream plays in the Mixlr web player (iframe from `albadrnet.mixlr.com`);
    recordings and book PDFs load from al-badr.net.
- **Foreground service** (`FOREGROUND_SERVICE_MEDIA_PLAYBACK`, from `@capgo/capacitor-media-session`):
  media playback of lessons that continues when the user leaves the app, with a media notification.
