# Web onboarding: no notifications on the web, one invite to the app

## Why

The website has no push notifications, but its onboarding plays the same previews as the apps: a notification drops into a small phone, is tapped, and opens the app. The switches are already hidden on the web (`native && hasSwitch` in `ui/Onboarding.tsx`), so a web visitor watches a notification they can't get, with nothing saying so. The install banner (`ui/InstallBanner.tsx`) never shows during the onboarding either, because `App.tsx` renders the onboarding instead of the shell that holds the banner.

The onboarding should show web visitors only what the website does, and say once, clearly, that notifications come with the mobile app.

## Goals

- On the web, no preview shows a notification, except on the one step that introduces the app.
- On the web, one step explains that notifications are only in the mobile app and links to the right store.
- The apps' onboarding stays exactly as it is.

Non-goals: changing the install banner on the home screen, adding web push, changing what the steps' texts say about the lessons.

Anti-goal: an install pitch that nags (repeated on every step) or blocks a web visitor from going on.

## Approaches

For the invite:

1. **A note on the last step** (prep), above «ابدأ», with the store badges. No new step, but it's easily missed on the way to «ابدأ».
2. **A short extra step on the web only**, after prep, with the notification preview captioned as the app, the badges, and «متابعة على الموقع». Visible, and it's the honest place to show a notification. Costs the web visitor one more tap. **Chosen.**

For the web previews there was one sensible way: keep each step's story but start it on the lesson page, with a tap on what the website shows instead of a tap on a notification.

## The design

### Steps 2–4 on the web

Each preview skips the notification beats (`small`, `big`, banner `tap`, `gone`) and starts on the lesson page of the same card. Instead of the banner tap, the ghost finger taps what a web visitor taps on that page. Where the tap leads comes from that element's own behaviour, not from push routing (`routeForPush`, `liveIntentAction`):

- **Live:** the lesson page shows the course on air, with `LiveHero`. The finger taps its big red disc (`Disc`, not the `.go-live` button under it). What opens follows `startLive` (`audio/live.ts`): with Mixlr (`live.mode` not `direct`), the live player (`LiveHead` + the drawn Mixlr embed) opens over the lesson, the phone slides to Mixlr's controls, the finger taps play, and it plays. With a direct stream, the app's player bar comes up playing the broadcast, with no sheet. This overrides, on the web only, the rule in `onboarding.md` that the live hero's red button never appears in the preview.
- **Revision:** as today after the notification: the recording card is highlighted, «استمع» is tapped, the player bar plays the recording, and «راجعتُه» is ticked. The web plays recordings and ticks the same way as the apps.
- **Preparation:** on the «الدرس القادم» card, the finger taps «اقرأ في الكتاب» (`BookChip` with the marker: `bookHref(course, next.pdfIndex, next.startPage, true)`, the same place the prep notification opens), the book opens at the passage, and «قرأتُه» is ticked. For a course with no book there is no chip: the card is just highlighted, as today.

On the web the caption «مثال: هكذا يصلك التنبيه» and the spoken sentences (`SPOKEN` in `ui/Preview.tsx`) describe the taps, without «يصلك تنبيه».

The still frame (the end of the story), the repeats, the reduced-motion behaviour and the inert picture are the same as in the apps.

### Step 5, web only: notifications are in the app

- Title along the lines of «التنبيهات في تطبيق الجوال», plus one line saying the website has no notifications and the app alerts you when the broadcast starts, when the recording is published and before the lesson. Final wording is settled in the plan.
- The live preview **with** its notification, as the apps show it today, with the caption saying this is the app. Its resting frame (after the plays, and the only frame with reduced motion) differs from the other steps: the notification stays in view, grown and readable, over the dimmed lesson page, since showing it is the step's purpose.
- With no course listed (`cardFor` returns null), the step shows no preview: only the text, the badges and the button.
- The store badges for the visitor's device, using the same rules as the install banner (`installStores` in `logic/install.ts`: Android → Play, iOS/iPadOS → App Store, otherwise both). Unlike the banner, it ignores the banner's dismissal.
- «متابعة على الموقع» finishes the onboarding, as «ابدأ» does today. Step 4 shows «متابعة» on the web.
- On the web, 5 dots instead of 4. Swipe and back work as on the other steps.
- A replay from المزيد shows it too.

The web build made with `VITE_NATIVE_UI=1` (store screenshots) follows the apps: `nativeUI()` decides, so no web step and no web previews there.

## Where the decisions live

- `logic/onboarding.ts`: the step list per platform (`STEPS` becomes a function of `native`), and which step is last.
- `logic/preview.ts`: a web variant of the beats per play (no banner beats, a tap on the page instead), what the finger taps, and where the phone pans to. All covered by unit tests, like the current beats.
- `ui/Preview.tsx` and `ui/Onboarding.tsx` stay thin and render what the logic decides. `Onboarding` reads `nativeUI()` once and passes the variant to `Preview` as a prop (`apps` / `web` / `invite`); `Preview` never reads the platform, so tests render each variant directly. The badges reuse `InstallBanner`'s badge assets and `STORES`.
- `docs/design/onboarding.md` is updated to describe the web flow.
- `changes/web-onboarding-install.json` with `"platforms": ["web"]`.

## Testing

- Unit tests for the web beats, the per-platform steps and the store choice on the new step.
- Visual tests (`app/test/visual/`, Chromium and WebKit) for each web step at phone width, and for step 5, including 320×568.
- The existing preview tests render `Preview` with no platform (the browser test environment is not native) and stand for the apps' story. They are changed to pass the `apps` variant explicitly, so their baselines keep pinning the apps' behaviour, and the web variant gets its own tests.
- Checked in the browser at phone width on the worktree's dev URL. Nothing needs a device: the apps' behaviour doesn't change.

## Left to the builder

- Exact Arabic wording of step 5 and of the web captions and spoken sentences.
- Timing of the new beats, in line with the existing ones.
