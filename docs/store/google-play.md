# Google Play listing

Package `com.albadrmubasher.app`, developer account "H2 Alliance" (organisation account). Default language
Arabic (ar), with an English (en-US) translation. Assets are generated outside the repo: screenshots from a
phone (status bar cropped, padded to Play's 2:1 limit), the 512 px icon from `app/resources/icon.png`, and
a 1024×500 feature graphic.

## Store listing

**App name** (30 chars max)
- ar: البدر مباشر | عبد الرزاق البدر
- en-US: Al-Badr Live Lessons

Home-screen label: البدر مباشر.

**Short description** (80 chars max)
- ar: بث مباشر وتسجيلات دروس الشيخ في المسجد النبوي مع موضع الدرس. تطبيق غير رسمي
- en-US: Live and recorded lessons from the Prophet's Mosque, Madinah. Unofficial app.

**Full description, ar**

> استمع إلى دروس الشيخ عبد الرزاق البدر في المسجد النبوي: البث المباشر وقت الدرس، وتسجيلات الدروس السابقة، مع
> موضع كل درس من الكتاب المشروح.
>
> • البث المباشر: تنبيه عند بدء الدرس، والاستماع من داخل التطبيق.
> • التسجيلات: كل درس بعنوانه وموضعه من الكتاب ورقم صفحته، لتراجعه متى شئت.
> • التحضير: يعرض لك من أين يبدأ الدرس القادم تقريبًا، لتقرأه قبل حضوره.
> • التنبيهات: تختار الدروس التي تتابعها، وتختار ما يصلك من كل درس: بدء البث، توفر التسجيل، تذكير بالتحضير.
> • الدروس الحالية: شرح تفسير السعدي بعد الفجر، والتعليق على شرح كتاب التوحيد بعد المغرب.
>
> لا يحتاج التطبيق إلى حساب، ولا يعرض إعلانات.
>
> هذا تطبيق غير رسمي من إعداد طلاب العلم، ولا يتبع الشيخ ولا موقعه. الدروس من موقع الشيخ al-badr.net وبثه
> المباشر.

**Full description, en-US**

> Listen to Sheikh Abdur-Razzaq Al-Badr's lessons in the Prophet's Mosque in Madinah: the live broadcast
> during the lesson, and recordings of past lessons, each with its place in the book being explained.
>
> • Live: a notification when the lesson starts, and listening inside the app.
> • Recordings: every lesson with its title, its place in the book and its page number, to review any time.
> • Preparation: roughly where the next lesson will start, so you can read it beforehand.
> • Notifications: choose the lessons you follow, and what each one sends you: broadcast start, recording
>   available, preparation reminder.
> • Current lessons: the explanation of Tafsir as-Sa'di after Fajr, and the commentary on the explanation of
>   Kitab at-Tawhid after Maghrib.
>
> No account needed, no ads.
>
> This is an unofficial app made by students of knowledge. It is not affiliated with the Sheikh or his
> website. The lessons come from the Sheikh's website al-badr.net and its live broadcast.

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
