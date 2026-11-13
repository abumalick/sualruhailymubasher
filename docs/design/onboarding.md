# Onboarding

The first launch explains what the app is for and lets the listener choose their notifications, in four screens built from the lesson screen's own components and the real `/api/state`. A redesign of the lesson screen or a new book changes the onboarding with no work on it.

| The app | Live | Revision | Preparation |
|---|---|---|---|
| ![](screenshots/onboarding-1-app.png) | ![](screenshots/onboarding-2-live.png) | ![](screenshots/onboarding-3-rec.png) | ![](screenshots/onboarding-4-prep.png) |

## The flow

```
[1 The app]  →  [2 Live]  →  (permission)  →  [3 Revision]  →  [4 Preparation]  →  lesson tab
 lessons as      live hero     only if the       recording card     next-lesson card
 checkable       + one         switch is on      + one switch       + one switch
 cards           switch        and permission
                               is still "prompt"
```

- **Screen 1** names each lesson with its real title, days and time, as checkable cards. At least one must be ticked.
- **Steps 2–4** each show one card from the lesson screen (`LiveHero`, `RecordingCard`, `NextCard` from `ui/cards.tsx`), taken from the first ticked lesson that has the data, inside a frame labelled «مثال من درس …». Nothing in the frame reacts: `inert` and `aria-hidden` for focus and screen readers, a capture-phase click handler for taps. The live step shows the hero exactly as during a broadcast (red, pulsing, «مباشر الآن»); when nothing is on air it is given the lesson as if it had just started, so it reads the next lesson and its passage from the course.
- Under the card, in its own block (so the example can be replaced without touching it), **one switch** for that notification, applied to every lesson ticked on screen 1. Its hint names those lessons; on the preparation step it gives each one's reminder time, one per line. Everything starts on.
  - **Other broadcasts** (`live-other`) have no switch of their own: they follow the live switch, on with it and off with it, even when only Fajr is ticked, since they are rare.
  - The switch reads on when any ticked lesson has that notification on («بث مباشر آخر» counts only when no lesson is listed: then the live switch is its switch, and revision and preparation show none). Left untouched, the record is saved as it came in, so a replay keeps the per-lesson detail set in التنبيهات; a tap sets every ticked lesson (and, on the live step, other broadcasts) to the new value.
  - The التنبيهات screen in المزيد keeps one switch per lesson and notification, plus its own «بث مباشر آخر»; the stored record stays per lesson.
- **Permission** is asked when the listener continues from the first step whose switch is on, and only while it is still `prompt`. Refused: the switches stay, with a line saying they will work once enabled.
- **Web:** the same screens without switches or permission.
- Choices and the `onboarded` flag are saved only on the last step; leaving mid-way starts again next launch. Everyone sees it once, existing users included, starting from their own choices; when the flag or the preference record can't be read, it is shown again. A tapped notification goes first: the onboarding waits for the next launch. «كيف يعمل التطبيق» in المزيد replays it; leaving from its first screen saves nothing, and a tapped notification closes it, replacing it in history, so back does not reopen it.

The decisions live in `app/src/logic/onboarding.ts` (steps, which card, what each step's switch controls and reads, when to ask, the record written at the end).

## One record of what the listener wants

Both lesson tabs are always shown. The only stored preference is `prefs` (`app/src/logic/prefs.ts`):

- `wanted`: the topics the listener chose, kept for a course that left the list, so a pause brings it back as it was. Only listed courses are subscribed; `topics` keeps what FCM accepted, so a failure is retried on the next sync.
- `known`: every course seen, with its slot, in the order it appeared.
- **A new book** inherits the switches of the last known course of its slot, even one that already left, so a gap between two books carries the choice over. A course in a slot with no history starts with every notification on, so finishing the onboarding while no lesson is listed still leaves the first lessons notifying. A slot whose lesson was left unticked stays silent: that lesson is known, with every switch off.
- **The tab the app opens on:** the soonest lesson with a switch on (all lessons when none), unless a broadcast is on air.

### Migration from the follow record

Older versions kept a `follow` record (which lessons are shown) and their subscribed `topics`. At the first launch of this version, once the course list is known:

1. `known` comes from the follow record in the order it saw courses; `wanted` from the stored topics (or all three kinds of the followed lessons when no topics were stored).
2. Courses the old record never saw go through the same inheritance as a new book.
3. Installs from before the lesson choice (topics only) keep their old default: all three kinds for a course they had not seen.

`follow` and `topic-courses` are removed once `prefs` is saved.
