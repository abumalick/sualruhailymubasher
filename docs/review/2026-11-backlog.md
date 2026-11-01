# Review backlog — v1.0.3 (2026-11)

A full review of the v1.0.3 test build covered four areas: the app as a student sees it (driven on an Android emulator and in a phone-sized browser), functional gaps against the [design spec](../superpowers/specs/2026-10-30-albadr-lessons-app-design.md), robustness of the server and the transcription agent, and docs. This file is the deduplicated backlog of what still needs work before and after store release.

**Baseline that holds.** Test suites pass (shared 2, app 107, server 162, agent 75), and typecheck is clean. Today's live state matches al-badr.net: Tafsir 453 and Tawhid 7, each with a recording. Both of today's broadcasts went to the right course, and each push (live, rec, prep) went out exactly once. The book opens at the expected page with the "next lesson" banner. Recordings play in the background with lock-screen controls. Layout holds at system font scale 2.0 and in dark mode.

**Not exercised.** Two checks could not be run during the review. Nothing was live on Mixlr, so real audio in the Mixlr embed was never tested. Pinch-zoom on a real touch screen was not tried either. Both are covered by L5 and P3 below.

## How to read this

- **Priority.**
  - **Must** (before store release): sends a student to the wrong page, time or lesson; breaks the book or the review player; makes a public mistake; or lets the system fail without anyone noticing.
  - **Should**: real friction or risk, but nothing is wrong.
  - **Later**: polish.
- **Effort.** S < 2 h · M < 1 day · L > 1 day.
- **Known.** "Known" means the spec or plans already list the limitation. It stays in the backlog when it hurts students.
- **Evidence.** Screenshots are in [`screenshots/`](screenshots/). Captured API state and the edge-case script with its output are in [`evidence/`](evidence/). The edge-case IDs (A1, B1 …) refer to [`evidence/edge-cases-output.txt`](evidence/edge-cases-output.txt), produced by [`evidence/edge-cases.test.ts.txt`](evidence/edge-cases.test.ts.txt) against the state captured in [`evidence/api-state-2026-11-01.json`](evidence/api-state-2026-11-01.json).

## Index

| ID | Item | Prio | Effort |
|---|---|---|---|
| **B1** | Book viewer renders Kitab at-Tawhid's Arabic text garbled | Must | M |
| **P1** | Tapping a recording again restarts it at 0:00; no seek, no saved position | Must | M |
| **L1** | Live embed: opening the book kills the audio; notification has no pause and stays "playing" | Must | M |
| **O1** | Nobody learns when the server breaks (no retained logs, no freshness checks) | Must | M |
| **O2** | Agent failures are invisible (errors swallowed, exit 0, no alert) | Must | M |
| **O3** | Admin "test push" goes to real subscribers | Must | S |
| **S1** | Live state freezes "live" (or misses a lesson) when Mixlr's API fails | Must | S |
| **S2** | Days off show a phantom "recording soon", still send the prep push, and drop the previous review | Must | M |
| **T1** | Times are Medina time with no label; day words are Medina-relative | Must | S (label) |
| **H1** | Tafsir hero: the big central button is a disabled no-op | Must | S |
| **A1** | One wrong page carries forward to every following lesson | Must | M |
| **A2** | Kitab at-Tawhid pages are PDF indices, 2 off the printed page | Must | S–M |
| S3 | Corrections made on al-badr.net never reach the app; no lesson delete | Should | M |
| S4 | Scraper changes fail silently | Should | S |
| S5 | Push is marked sent before sending: one failure loses it for good | Should | S |
| S6 | Live pushes have no expiry, so they can arrive hours late | Should | S |
| S7 | Any broadcast in a course's 2h50 window counts as a lesson | Should | S |
| S8 | Client and server disagree when exceptions overlap | Should | S |
| S9 | No way to express Ramadan/seasonal time changes | Should | S–M |
| A3 | Start points are cut mid-word at 80 characters | Should | S |
| A4 | Lessons outside the newest 3 never get pages | Should | S |
| A5 | Production agent runs from the development working tree | Should | S |
| AD1 | Admin page: no status, misleading fields, silent failures | Should | M |
| AD2 | Admin API hardening | Should | S |
| B2 | Book viewer: no zoom, no volume switch, dead end at the end of vol. 1, reversed arrows | Should | M |
| B3 | No page counts per volume: no "progress through the book", estimates can't cross volumes | Should | M |
| B4 | First book open waits ~12 s on a bare "…" | Should | S–M |
| H2 | Estimated start page shown as exact | Should | S |
| H3 | Cancellations and pauses are never shown to students | Should | S |
| H4 | Course page "وصلنا إلى" mixes two lessons; tonight's lesson is missing; no dates | Should | S |
| H5 | Ticks and the three-step indicator are hard to understand and to use | Should | S |
| L2 | Live sheet: Mixlr's English page, no lesson context, no tester note | Should | S |
| L3 | Live hero has no text button; "other" broadcasts say almost nothing | Should | S |
| N1 | Notification permission: asked cold, asked twice, denial not handled; foreground pushes invisible | Should | S–M |
| X1 | Offline and stale data: no data age, vague errors, empty tabs | Should | S |
| X2 | Contrast and text size too low | Should | S |
| X3 | Mini player cuts off the lesson number | Should | S |
| D1 | Docs and code that will slow future work | Should | S |
| X4 | TalkBack: fragmented lines, no current-tab state, background reachable under the live sheet | Later | S |
| X5 | System bars don't take the theme colours; splash doesn't match | Later | S |
| H6 | Unknown start page opens vol. 1 at the cover | Later | S |
| H7 | At night "دروس اليوم" shows two "انتهى" and nothing about tomorrow | Later | S |
| H8 | Links screen alignment; WhatsApp 1 vs 2 unexplained; no "about"/version | Later | S |
| S10 | Reminder dropped if the cron misses its 5-minute window | Later | S |
| S11 | Duplicate "other live" pushes; live detection latency | Later | S |
| S12 | Older lessons can't be loaded (README says they can) | Later | S |
| S13 | Smaller robustness points | Later | S |
| D2 | Fixture states can't be reached on a device build | Later | S |

References such as (Q3) point to [Decisions on the review questions](#decisions-on-the-review-questions) at the end.

---

## Must before store release

### B1. The book viewer renders Kitab at-Tawhid's Arabic text garbled
- **Impact:** The in-app book is unreadable. Letters are disconnected, spaced out, and some are dropped. Opening the book at the right page is the main thing the "prepare" and "review" steps offer, so this breaks the study cycle for Kitab at-Tawhid.
- **Evidence:**
  - Volume 1, page 235, in the app: [`book-garbled-arabic-text.png`](screenshots/book-garbled-arabic-text.png).
  - The same page rendered by poppler, correct: [`book-reference-render-same-page.png`](screenshots/book-reference-render-same-page.png).
  - `pdffonts` reports embedded Type 1C subsets with WinAnsi encoding and no ToUnicode map.
  - The loader is `getDocument({ data })` with the pdf.js legacy build (`app/src/ui/Book.tsx:39-46`).
  - Seen on Android 16 with WebView 133. Same result at font scale 2.0 and in dark mode.
- **Direction:**
  - First reproduce on a real phone and in desktop Chrome with the same bundle, because the emulator's WebView could be a factor.
  - Then try `disableFontFace: true`, the non-legacy build, and `cMapUrl`/`cMapPacked` plus `standardFontDataUrl`.
  - Add a visual regression check on one known page.
- **Effort:** M · **Known:** no

### P1. Tapping a recording again restarts it at 0:00; no seek, no time, no saved position
- **Impact:** A student pauses a 40–90 min lesson at minute 10, then taps «راجِع» or «استمع» on the card again. Playback starts over from 0:00. The mini player has only play/pause and a 2 px line: no elapsed or total time, no scrubber, no ±15/30 s skip, no speed control. Killing the app loses the position. Review is the core of the cycle.
- **Evidence:**
  - Measured on device: paused at t=600.5 s, tapped «راجِع» again, and playback was at t=5.0 s. The same happened in the browser: [`replay-restart-from-zero.png`](screenshots/replay-restart-from-zero.png).
  - `player.play()` always reassigns `a.src` and resets the position to 0 (`app/src/audio/player.ts:89-93`). Every card tap goes through it (`app/src/App.tsx:19`).
  - The mini player's own play button does resume.
  - The progress line is display-only (`app/src/ui/MiniPlayer.tsx:27`). It is anchored left (`app.css:93`), so it fills left-to-right in an RTL UI.
  - Seeking exists only through the lock-screen `seekto` handler (`player.ts:82`). Nothing is persisted.
  - [`mini-player-recording.png`](screenshots/mini-player-recording.png)
- **Direction:**
  - If the tapped URL is already loaded, `resume()` instead of reloading.
  - Persist `pos:<url>` (every ~10 s and on pause) and restore it on `loadedmetadata`, with a «تابع من ١٢:٣٤» hint.
  - Make the mini player open a full player sheet: scrubber that fills right-to-left, elapsed/total, ±15 s, 1×/1.25×/1.5×.
- **Effort:** S for resume + persistence, M for the player sheet · **Known:** no

### L1. Live embed: opening the book kills the audio, the notification can't pause, and it stays "playing"
- **Impact:** "Listen live and follow in the book" is the spec's first live use case, and it is impossible:
  - The live sheet is full screen.
  - Navigating to the book (from the hero, a deep link or a notification tap) unmounts the Mixlr iframe and the audio stops.
  - The media notification then stays "playing" over silence.
  - The notification has no pause button, so "pause closes the live sheet" can't be triggered from it, and it reports "playing" even when the embed is OFF AIR.
  - The Android back button does not close the sheet.
- **Evidence:**
  - The book route returns its own tree without `<LiveSheet>` (`app/src/App.tsx:54-74`). The sheet is only rendered in the other tree (`:85-91`).
  - With the sheet open, setting `location.hash` to the book gave `sheet=false iframe=false`, but the media session stayed PLAYING: [`live-notification-stale-after-book.png`](screenshots/live-notification-stale-after-book.png).
  - `dumpsys media_session`: live session `state=PLAYING actions=4` (PLAY only), recording session `actions=770`: [`live-notification-no-pause-control.png`](screenshots/live-notification-no-pause-control.png).
  - `KEYCODE_BACK` with the sheet open leaves it open.
- **Direction:**
  - Mount the live player once at the App root, outside the route switch, and collapse it into a bar in the mini-player slot instead of unmounting it. The bar shows the course, lesson and «تابع في الكتاب».
  - Register the pause action for the embed session.
  - Clear the media session (`playbackState: 'none'`) whenever the player is closed.
  - Wire hardware back to collapse the sheet.
- **Effort:** M · **Known:** partly. Background and lock-screen limits are known; this foreground conflict and the stale notification are not.

### O1. Nobody learns when the server breaks
- **Impact:** A broken scraper or failing pushes look exactly like a quiet day. Students stop getting live alerts, new recordings or reminders, and the owner hears about it from users.
- **Evidence:**
  - `server/wrangler.jsonc` has no `observability` block. Every `console.error` in the cron jobs (`src/index.ts:43`, `jobs/recordings.ts:150,161`, `jobs/live.ts:73`, `jobs/reminders.ts:130`) is visible only to someone running `wrangler tail` at that minute.
  - `/api/health` returns `{ok:true}` without touching D1 or any job state (`src/index.ts:18`).
  - Nothing records "last successful ingest" or "last successful live poll".
- **Direction:**
  - Enable Workers Logs.
  - Store `last_ok_at` per job (live poll, ingest per course, reminders) and the agent's last run (see O2).
  - Expose them on `/api/health` and on the admin page.
  - Add an external check that sends one Telegram or e-mail message when a timestamp is too old.
- **Effort:** M · **Known:** no

### O2. Agent failures are invisible
- **Impact:** If the agent machine is off, the `claude` CLI is logged out, a PDF tool is missing, or a book is corrupt, end pages stop arriving. The app silently falls back to estimates that drift further every day.
- **Evidence:**
  - `agent/src/albadr_agent/cli.py:158-162` catches every non-auth exception per lesson, logs it and continues. `main` returns 0 (`cli.py:251`).
  - Only `ClaudeUnavailable` exits 1, and `agent/systemd/albadr-agent.service` has no `OnFailure=`.
  - Rejected or low-confidence verdicts are cached (`cli.py:102-105`) and re-logged every 15 min, but nothing reaches the server.
- **Direction:**
  - After each run, have the agent report to the server: last run, lessons patched, lessons skipped with a reason. Show skipped lessons in the admin page as «يحتاج مراجعة».
  - Add `OnFailure=` with a notification.
  - Exit non-zero when a lesson raised, as opposed to being merely skipped.
- **Effort:** M · **Known:** no

### O3. Admin "test push" goes to real subscribers
- **Impact:** «إرسال تنبيه تجريبي» sends «تجربة / تنبيه تجريبي من دروس البدر» to every student subscribed to the chosen course topic. After release this is a public mistake.
- **Evidence:** `server/src/routes/admin.ts:248-251` accepts only the real topics (`c-<id>-live|rec|prep`, `live-other`). The placeholder suggests `c-tafsir-saadi-live` (`server/src/admin-page.ts:96`).
- **Direction:** Add a dedicated `test` topic that only debug builds, or a hidden tester switch in the app, subscribe to. Make it the only target of the button.
- **Effort:** S · **Known:** no

### S1. Live state freezes when Mixlr's API fails
- **Impact:** If Mixlr errors or changes shape mid-broadcast, `isLive` stays true indefinitely. Every user sees «مباشر الآن» and an empty embed. In the reverse case, a lesson that starts during the outage never shows as live and sends no push.
- **Evidence:**
  - `server/src/jobs/live.ts:28-29` returns before `setLive` when the poll fails, and `:35` does the same when there is no uid.
  - The test "leaves state untouched on a 503" (`server/test/live.test.ts:119`) treats this as intended.
  - No "last confirmed" timestamp exists.
- **Direction:**
  - Store `checked_at` on each successful poll.
  - `/api/state` reports `isLive:false` (or `stale:true`) when the last confirmation is older than ~10 min, or when `started_at` is older than ~4 h.
  - The app also ignores `live` from a cached state older than ~10 min (see X1).
- **Effort:** S · **Known:** no

### S2. Days off show phantom lessons, still send the prep push, and drop the previous review
- **Impact:** The sheikh often skips days without notice. Tafsir had no lesson on 24–25 Sep, the whole week of 12–16 Oct, or 30 Oct. On every such day, unless an exception was entered in time:
  - the evening-before «حضّر» push still fires;
  - home shows «التسجيل قريبًا · الدرس 453» for a lesson that never aired;
  - «دروس اليوم» shows it as upcoming, then «انتهى»;
  - the previous lesson's review disappears at the scheduled start, because the review lasts "until the next lesson starts", and that lesson never comes.
- **Evidence:**
  - Edge case B1 (Fri 30 Oct, 06:30, no broadcast): hero `awaiting-recording tafsir 453`, today `upcoming`.
  - The in-window rule creates `awaiting` without any broadcast (`app/src/logic/home.ts:78-80`). Today's status depends only on the clock (`home.ts:66`).
  - Production has 0 exceptions.
  - The weekday mapping of lessons 424–453 from `/sub/456` shows the gaps.
  - Numbering self-corrects, because `expectedNextNumber` counts real broadcasts.
- **Direction:**
  - Expose "aired today" per course (the `broadcasts` table already has it).
  - Show «التسجيل قريبًا» only after a broadcast in the window. After the window passes with none, show «لم يُبثّ الدرس».
  - Keep the previous review until a lesson actually airs.
  - Keep sending the prep reminder even after a lesson that did not air (Q3): a missed reminder costs more than a spurious one.
  - The real fix for announcements is the Telegram reader (later iteration 2).
- **Effort:** M · **Known:** partly. Exceptions are manual in v1. How often breaks happen, and the lost review, are not discussed.

### T1. Times are Medina time with no label
- **Impact:** Listeners are worldwide, but «الدرس القادم … الاثنين ٥:٣٤ ص», «دروس اليوم» and the reminder labels show Medina clock times with no zone.
  - A student in Jakarta reads 05:34 for a 09:34 local lesson.
  - At 01:30 local on Tuesday the tag says «غدًا» for a lesson that is that same morning locally.
  - Reminders arrive at 01:00 in Jakarta and at 07:30 in New York.
  - «الفجر/المغرب» reads as the user's own prayer.
  - DST is not a problem: everything is pinned to UTC+3.
- **Evidence:** Edge cases E1 and E2. `dayWord` uses `medinaDate` and `clock12` has no zone (`app/src/ui/format.ts:16,22`). The reminder labels are hard-coded (`app/src/ui/Notifications.tsx:6-9`). Server reminder times: `server/src/jobs/reminders.ts:21`.
- **Direction:**
  - Now: append «بتوقيت المدينة» everywhere a time appears (S).
  - Then: show the device-local time first, with Medina time as a second line, and day words relative to the device date (M).
  - Reminders stay at fixed Medina times, as the spec sets for v1 (Q2). Per-zone reminders would need local notifications (L, later).
- **Effort:** S / M / L · **Known:** no

### H1. Tafsir hero: the big central button is a disabled no-op
- **Impact:** In the Tafsir "prepare" and "review" states, the central star disc with the book icon («اقرأ في الكتاب») looks exactly like the active play button but does nothing. TalkBack reads it as "disabled" with no reason. The «ص ٦٢٨ · طبعة دار ابن الجوزي» pill looks like a button and is not one. A newcomer's first tap on the most prominent control does nothing.
- **Evidence:** [`home-prepare-hero-light.png`](screenshots/home-prepare-hero-light.png). `Home.tsx:207` passes `onClick={undefined}` when there is no PDF, and `Star.tsx:36` sets `disabled` with no disabled style (`app.css:6`).
- **Direction:**
  - When no PDF is linked, render the disc as an illustration, or give it a real action (play the latest recording, open the course).
  - Make the page plain, prominent text: «اقرأ من نسختك: ص ٦٢٨ (طبعة دار ابن الجوزي)».
- **Effort:** S · **Known:** the missing PDF is deliberate; the misleading control is not.

### A1. One wrong page carries forward to every following lesson
- **Impact:** If the agent places one lesson's end one page off, the next lesson inherits it as its start, and nothing ever re-checks it. Students are sent to the wrong page to prepare and to review.
- **Evidence:**
  - `server/src/repo.ts:132-144` copies the previous `end_page` into `start_page`.
  - `agent/src/albadr_agent/cli.py:44-48` (`_own_start`) trusts that page without checking that the lesson's own start-point text is on it.
  - Lessons with `end_page` set leave the pending list for good (`repo.ts:287`).
  - Real case: for #452 the next start point matched page 627 with a score of 0.67, below `NEXT_MATCH = 0.8` (`agent/src/albadr_agent/locate.py:16`). The agent then fell back to the recording and patched 626–628, and #453 became 628–628. Production was corrected by hand to 626–627 and 627–628, so the text match had been right.
- **Direction:**
  - Before using a chained start, require the start-point text to match near that page; otherwise re-locate it.
  - When lesson N+1 is published, re-check lesson N's end against N+1's start point, and correct or flag it.
  - Consider accepting a 0.6–0.8 next-start match when it lies within ±1 page of the recording's answer.
- **Effort:** M · **Known:** no (the spec assumes the agent's end is authoritative)

### A2. Kitab at-Tawhid page numbers are PDF indices, 2 off the printed page
- **Impact:** The app says «ص ٢٣٥», but the page prints ٢٣٣. Inside the in-app viewer this is consistent. A student with a paper copy, or reading the PDF in another reader that shows printed numbers, lands 2 pages off. Each volume likely has its own offset.
- **Evidence:**
  - Volume 1: PDF page 223 prints «221», and PDF page 229 prints «227». The header shows ص ٢٣٥ over a page printed ٢٣٣ ([`book-garbled-arabic-text.png`](screenshots/book-garbled-arabic-text.png)).
  - Tafsir is fine: page 628 of the Ibn al-Jawzi scan prints ٦٢٨ ([`tafsir-scan-p628-printed-628.png`](screenshots/tafsir-scan-p628-printed-628.png)).
- **Direction:** Add a `pageOffset` per volume (admin field). Show the printed number, and convert to the PDF index only when opening the viewer.
- **Effort:** S–M · **Known:** no · Printed numbers chosen (Q1).

---

## Should

### S3. Corrections made on al-badr.net never reach the app; the admin can't delete a lesson
- **Impact:** When the site edits a lesson's title, date or detail page after publishing, the app keeps the first version forever. A wrongly numbered entry becomes a permanent extra lesson.
- **Evidence:**
  - `INSERT OR IGNORE` on `(course_id, number)` (`server/src/repo.ts:120-127`). Only `recording_url` is ever updated.
  - This is happening now: the site shows 451/452 as «من الآية (٥٣)»/«(٦٠)», while production still has `(53)`/`(60)` ([`api-state-2026-11-01.json`](evidence/api-state-2026-11-01.json)).
  - The admin API has no lesson DELETE (`routes/admin.ts`).
- **Direction:** On each scrape, update `start_point`, `hijri_date` and `detail_path` when they differ, unless an `edited_by_admin` flag is set: the admin wins (Q11). Add a "delete or hide lesson" admin action.
- **Effort:** M

### S4. Scraper changes fail silently
- **Impact:** Any markup or wording change on al-badr.net yields zero new lessons, with no error anywhere: no recordings and no review pushes.
- **Evidence:**
  - `server/src/sources/albadr.ts:9-10`: strict `ENTRY_RE` and `TITLE_RE` (`NNN … DD-MM-YYYY`). Non-matching entries are skipped silently (`:31-32`).
  - `lastPageOffset` returns 0 when the pagination link format changes (`:39-44`), so ingest re-reads lessons 1–20.
  - `fetchMp3` treats a non-200 response as "no mp3 yet" (`jobs/recordings.ts:122-125`).
- **Direction:** Treat "page has `/detail/` links but 0 parsed" and "newest number unchanged for N days while broadcasts were seen" as errors that reach O1. Log unmatched titles.
- **Effort:** S

### S5. A push is marked sent before it is sent, so one failure loses it
- **Impact:** A transient FCM or OAuth error at the minute a lesson goes live means nobody gets that live alert. The same applies to the rec and prep pushes.
- **Evidence:** `markSent` runs before `sendToTopic` in `jobs/live.ts:55-74`, `jobs/reminders.ts:104-118` and `jobs/recordings.ts:142-151`. The behaviour is deliberate (`server/test/recordings.test.ts:123`).
- **Direction:** Keep claim-first. On failure, delete the key (or store `attempts` and `last_error`), so the next tick retries while the event is still relevant.
- **Effort:** S

### S6. Live pushes have no expiry, so they can arrive hours late
- **Impact:** A phone that was offline or in Doze gets «بدأ البث المباشر» when it reconnects, possibly after the lesson has ended. Tapping it opens an empty live sheet.
- **Evidence:** `server/src/fcm.ts:236-243` sets no `android.ttl` and no `apns-expiration`, so FCM's default of up to 4 weeks applies.
- **Direction:** Set an expiry per push type:
  - live: ~2–3 h;
  - prep: until the lesson time;
  - rec: a day or more.
- **Effort:** S

### S7. Any broadcast in a course's window counts as a lesson
- **Impact:** A broadcast from 20 min before to 150 min after a course's start time is attributed to that course. For Maghrib that window runs until about 20:40, so a one-off talk after Isha would:
  - send the course's live push with a lesson number;
  - show as that course's lesson;
  - bump the next lesson number until al-badr.net publishes.

  The «قرأتُه» tick (`read:<course>:<n>`) can then attach to the wrong lesson. This has not been observed yet: today's numbers agree.
- **Evidence:** `server/src/schedule.ts:7,54-65` (`LEAD_MS`, `LESSON_MS`, `courseInWindow`). Today's starts were 05:46 against a computed 05:34, and 18:06 against 18:11. `expectedNextNumber` is in `repo.ts`.
- **Direction:**
  - Narrow the window to roughly ±30 min around the start time.
  - Log each broadcast's offset and show the drift on the admin page.
  - Keep attributing immediately, because the live push can't wait for confirmation, and let the admin re-attribute a broadcast (Q10).
- **Effort:** S · **Known:** partly (attribution by window is the spec's rule; its width is not)

### S8. Client and server disagree when exceptions overlap
- **Impact:** A pause with an extra lesson inside it, typical for Eid, is scheduled by the server but missing from the app's «دروس اليوم».
- **Evidence:** Edge case D: server `{"held":true}`, client `[]`. The server checks `extra` before `removed` (`server/src/schedule.ts:24-31`); the client checks them in the opposite order (`app/src/logic/home.ts:36-37`).
- **Direction:** Have the server send `today: {held, time} | null` per course, so the app does not re-derive the schedule. Failing that, make the precedence identical.
- **Effort:** S

### S9. Ramadan and seasonal time changes can't be expressed
- **Impact:** In Ramadan 1448 (≈ 8 Feb – 9 Mar 2027) lesson times usually shift. The only tool is an `extra` range, which also turns every day off (Friday, Saturday) into a lesson day.
- **Evidence:** Edge case H1: an extra range at 22:00 makes Friday and Saturday lesson days for a Sunday–Thursday course. The kinds are `cancel | pause | extra | move` (`shared/src/api.ts`).
- **Direction:** Add a `retime` kind: a date range plus a new time or offset, keeping the weekdays.
- **Effort:** S–M · Build before Ramadan; enter the actual times once they are announced (Q8)

### A3. Start points are cut mid-word
- **Impact:** The prepare card, the 21:00 reminder and the next lesson's start show text like «…مِنْ قُو», cut mid-word with an unclosed ﴿ and no «…».
- **Evidence:** `agent/src/albadr_agent/cli.py:72,137` (`next_start_point[:MAX_END_POINT]`, 80 characters). Production `endPoint` for #451/#452 ends in «قو» and «وَ».
- **Direction:** Store the next start point whole (the column is unbounded), or cut at a word boundary and add «…».
- **Effort:** S

### A4. Lessons outside the newest 3 never get pages
- **Impact:** A lesson the agent could not place in time (machine off for a weekend, CLI logged out, book not configured) drops out of the queue after three newer lessons arrive. Its review card never gets a page.
- **Evidence:** `server/src/repo.ts:284-287` (`rank <= 3`). In production, Tafsir 449–450 and Tawhid 1–4 have `startPage: null`.
- **Direction:** Widen the window (e.g. 10 lessons or 14 days, oldest first), with a per-lesson failure count that stops retries (ties into O2).
- **Effort:** S

### A5. The production agent runs from the development working tree
- **Impact:** Every 15 min, whatever is checked out in `agent/` (a feature branch, half-written code) runs against production with the admin token.
- **Evidence:** `agent/systemd/albadr-agent.service`: `uv run --frozen --project …/lessons-radio/agent`.
- **Direction:** Run from a dedicated checkout pinned to `main` (or a tool install from a tag), and update it explicitly.
- **Effort:** S

### AD1. The admin page is hard to use for a non-technical operator
- **Impact:** The operator can't see whether things work, can't fix older data, and can misread several fields. One of them silently cancels a lesson.
- **Evidence:**
  - **No status:** there is no last ingest, last poll, agent outcome or pending list (`server/src/admin-page.ts`).
  - **Ingest always reports success:** «تحديث الدروس الآن» says «تم تحديث الدروس» even when the scrape failed. Per-course errors are caught (`jobs/recordings.ts:158-162`) and the endpoint returns 204 (`routes/admin.ts:263-275`).
  - **«رقم ملف PDF» is 0-based:** the first volume is "0" (`admin-page.ts:264,272`, `routes/admin.ts:163`), and there is no bounds check.
  - **«تأجيل» without a date cancels the lesson:** the second date is labelled «إلى تاريخ (اختياري)» for every kind. For `move`, leaving it empty cancels the lesson with no new date (`schedule.ts:184,191`). The server accepts `move` without `dateTo`, and also accepts `dateTo < dateFrom` (`routes/admin.ts:175`).
  - **Other gaps:**
    - Only the latest 10 lessons per course are editable (`admin-page.ts:303`).
    - Deleting an exception has no confirmation (`:243`).
    - The test-push topic is free text.
    - `embed`/`direct` are shown in English.
    - The computed lesson time is not shown.
- **Direction:**
  - Add a status card (from O1 and O2), and return per-course ingest results.
  - Number volumes from 1 («المجلد ١»).
  - Give each exception kind its own fields, with a required «التاريخ الجديد» for تأجيل.
  - Page through older lessons.
  - Use Arabic labels and a topic dropdown (see O3).
- **Effort:** M

### AD2. Admin API hardening
- **Impact:** Small today, but cheap to close before an operator gets the admin URL.
- **Evidence:**
  - `Access-Control-Allow-Origin: *` on `/api/admin/*` (`routes/admin.ts:185-188`). It is not needed, because the page is same-origin.
  - No CSP or `frame-ancestors` on `/admin`, and the token sits in `localStorage`.
  - No rate limit and no audit log.
  - `pdfUrls` is not validated, and `weekdays` accepts duplicates or an empty list.
- **Direction:**
  - Drop CORS on admin routes.
  - Add a CSP with `frame-ancestors 'none'`.
  - Optionally put Cloudflare Access in front of `/admin*`.
  - Add a `changes` log table.
- **Effort:** S

### B2. Book viewer: no zoom, no volume switch, dead end at the last page, reversed arrows
- **Impact:**
  - **No zoom:** the page is a canvas at screen width with swipe handlers only. Dense Arabic commentary is hard to read, especially for older readers.
  - **No way to other volumes:** volumes 2 and 3 can't be reached once a page is known. At 498/498 of vol. 1 there is no "continue in vol. 2", and the viewer never says which volume is open.
  - **Reversed arrows:** the pager arrows point inward. In RTL, "previous" (right) shows ‹ and "next" (left) shows ›, the opposite of the direction of travel.
  - **Wrong tick:** opened from a review, the footer tick is «قرأتُه» for the *next* lesson, not «راجعتُه».
  - **Back:** it always goes to the course page, even when the student came from home.
- **Evidence:**
  - Zoom: `Book.tsx` canvas at `clientWidth − 28`. Capacitor's `zoomEnabled` defaults to false and is not set (`app/capacitor.config.ts`), so `touch-action: pinch-zoom` has no effect. Not tried with multi-touch on a device.
  - Volumes: `Course.tsx:90` shows the volume chips only when the page is unknown. [`book-last-page-volume1.png`](screenshots/book-last-page-volume1.png).
  - Arrows: `Book.tsx:157,163` use the text glyphs › and ‹, which bidi-mirror in RTL. [`book-pager-both-arrows-same.png`](screenshots/book-pager-both-arrows-same.png).
  - Tick and back: `Book.tsx:106,112`.
- **Direction:**
  - Render at 2× in a scrollable container with pinch or double-tap zoom.
  - Add a «الجزء ١ ▾» switcher in the header and a «الجزء التالي» button on the last page.
  - Replace the glyphs with the mirrored `i-back` SVG icon.
  - Pass the origin (`?from=review&n=453`) so the right tick shows, and go back with `history.back()`.
- **Effort:** M

### B3. No page counts per volume
- **Impact:**
  - The spec's "progress through the book" on the course page is missing.
  - When the class crosses the end of Tawhid vol. 1 (498 pages, ~40 lessons away), estimated pages beyond 498 stay in vol. 1. The viewer then clamps to the last page and shows the "next lesson" banner on the wrong page.
  - The pace estimate also mixes volumes: `estimate.ts:308-310` subtracts pages across a volume change, which skews the median.
- **Evidence:** The spec data model has "page count", but `CourseDTO` (`shared/src/api.ts`) has only `pdfUrls`. `server/src/estimate.ts` adds pages without a limit (edge case F2). Clamping is in `Book.tsx` (`clamp`).
- **Direction:**
  - Store the page count per volume (the agent can report it) and roll estimates into the next volume.
  - Skip cross-volume lessons when computing the pace.
  - Show a thin progress bar on the course page and the course list.
- **Effort:** M · **Known:** in the spec, not built

### B4. The first book open waits ~12 s on a bare "…"
- **Impact:** Vol. 1 is 6.2 MB. On first open the student sees three dots for ~12 s on a good connection, and longer on mobile data. Many will think the app froze.
- **Evidence:** [`book-loading-dots.png`](screenshots/book-loading-dots.png). `Book.tsx:127`.
- **Direction:** Show «جارٍ تنزيل الكتاب (٦ م.ب) — مرة واحدة فقط، ثم يعمل دون اتصال» with a progress bar. Optionally pre-fetch the active volume on Wi-Fi.
- **Effort:** S–M

### H2. An estimated start page is shown as exact
- **Impact:** The spec says the next passage is marked approximate. Only the end is («إلى نحو ص»). When the previous lesson's end page has not arrived, the start page is an estimate but reads «اقرأ في الكتاب · ص ٢٣٥». At review time, Kitab lesson 9 was `estimated: true`.
- **Evidence:** `passageLine` (`app/src/ui/format.ts:34`). `estimated` is never read in `app/src`. [`web-home-prepare-estimated.png`](screenshots/web-home-prepare-estimated.png).
- **Direction:** Prefix with «نحو ص» when `estimated`.
- **Effort:** S

### H3. Cancellations and pauses are never shown to students
- **Impact:** When the admin enters a cancellation, pause or postponement, the lesson just disappears from «دروس اليوم». Nobody is told it is cancelled or until when the course pauses, so students wait for a live that won't come.
- **Evidence:** `exceptions` is used only to hide today's session (`app/src/logic/home.ts:33-41`). Nothing in `app/src/ui/` renders it.
- **Direction:** Show a notice card on home and on the course page («أُلغي درس المغرب الليلة», «الدرس متوقف حتى …»), with the admin's note appended to app-written wording. Also send a push to the course's live topic (Q4).
- **Effort:** S

### H4. The course page's «وصلنا إلى» mixes two lessons
- **Impact:** «وصلنا إلى الدرس ٧ · من قوله …» shows lesson 7's start point next to the *next* start page (ص ٢٣٥) and «الدرس القادم ٩». Lesson 8, held tonight, appears nowhere on the page, while home says «بانتظار التسجيل · الدرس ٨». Recording rows have no date, so "which one was Tuesday's?" can't be answered, and they have no book link.
- **Evidence:** [`course-tawhid-lesson8-missing.png`](screenshots/course-tawhid-lesson8-missing.png), [`course-tafsir.png`](screenshots/course-tafsir.png). `Course.tsx:76-87`. `Courses.tsx`.
- **Direction:**
  - Rephrase as «الدرس القادم ٩ يبدأ من: … (ص ٢٣٥)».
  - Show the latest held lesson as its own row («الدرس ٨ · أُلقي الليلة · التسجيل قريبًا»).
  - Add the Hijri date and weekday, plus a book link, to each recording row.
- **Effort:** S

### H5. Ticks and the three-step indicator are hard to understand
- **Impact:**
  - **Compact ticks:** in cards they are a faint check (≈2.3:1 contrast) with no word, so a newcomer won't know they can be tapped.
  - **Review cards:** in «لم تراجعه بعد» cards, the lesson can't be marked reviewed; only «راجِع» (play) is offered.
  - **Steps indicator:** «تحضير · الدرس · مراجعة» is unexplained, and colour is its only state cue.
- **Evidence:** `Home.tsx:88-95`, `app.css:53`. [`home-today-all-finished.png`](screenshots/home-today-all-finished.png).
- **Direction:**
  - Use labelled ticks everywhere («✓ قرأتُه»), and add a «راجعتُه» tick to review cards.
  - Give the steps an `aria-label` with their state, and a one-time caption.
- **Effort:** S

### L2. The live sheet is Mixlr's English page with no context
- **Impact:**
  - **Mixlr's own UI:** students see "OFF AIR", "Follow" and "Share", and those buttons lead out to Mixlr: the clutter the app exists to avoid.
  - **No context:** the header is a fixed «البث المباشر», with no course or lesson.
  - **No guidance:** there is no Arabic hint to press Mixlr's play button.
  - **Missing tester note:** the plan's note «لمواصلة الاستماع أبقِ الشاشة مفتوحة» was never added, so the known v1 limitation isn't stated to testers as the spec requires.
- **Evidence:** [`sim-live-sheet-mixlr-embed.png`](screenshots/sim-live-sheet-mixlr-embed.png), [`web-live-sheet.png`](screenshots/web-live-sheet.png). `LiveSheet.tsx:18` ignores the `title` it is passed. `docs/superpowers/plans/2026-10-30-mobile-app.md:138`.
- **Direction:** Show the course and lesson above the iframe, plus one line on how to start the audio and what happens when the screen locks. This folds into L1's bar.
- **Effort:** S · **Known:** embed yes, copy no

### L3. The live hero has no text button; other broadcasts say almost nothing
- **Impact:**
  - **No text button:** during a live lesson the only control is the star disc with ▶. The review state has a text «استمع»; the live state has no «استمع إلى البث».
  - **Other broadcasts:** a broadcast outside the courses reads only «مباشر الآن · البث المباشر».
- **Evidence:** [`sim-live-home.png`](screenshots/sim-live-home.png), [`sim-live-other-missing-data.png`](screenshots/sim-live-other-missing-data.png). `Home.tsx:178-205`.
- **Direction:** Add a primary «استمع إلى البث» chip. For other broadcasts, use the spec's «درس مباشر» plus «محاضرة أو كلمة خارج الدروس المقررة».
- **Effort:** S

### N1. Notification permission: asked cold, asked twice, denial not handled; foreground pushes invisible
- **Impact:**
  - **Cold ask:** the system dialog appears within ~2 s of the very first launch, before the student knows what the app is.
  - **Second ask:** a denial is asked again at the next launch, and a second denial is permanent.
  - **Switches lie:** after a denial, every switch still shows ON.
  - **No way back:** after a permanent denial there is no button to open system settings.
  - **Foreground:** on Android, a push that arrives while the app is open is not shown, and there is no in-app toast.
- **Evidence:**
  - Screenshots: [`first-launch-notification-prompt.png`](screenshots/first-launch-notification-prompt.png), [`notification-reprompt-second-launch.png`](screenshots/notification-reprompt-second-launch.png), [`notifications-after-first-deny-no-warning.png`](screenshots/notifications-after-first-deny-no-warning.png), [`notifications-denied-no-settings-link.png`](screenshots/notifications-denied-no-settings-link.png).
  - `push.ts:98-104` asks on every launch while the state is `prompt`.
  - `Notifications.tsx:51` handles only `denied`.
  - No `notificationReceived` handler exists in `app/src`.
- **Direction:**
  - Ask from a soft in-app card on home («فعّل التنبيهات لتصلك بداية البث وتذكير التحضير»).
  - Show the switches as off and greyed while permission is not granted, with a «فتح الإعدادات» deep link.
  - On `notificationReceived`, refresh and show a toast.
- **Effort:** S–M · Must if store review flags it · Topics stay on by default once permission is granted (Q6)

### X1. Offline and stale data
- **Impact:**
  - **Stale live:** a cached «مباشر الآن» keeps showing for days offline (edge case A3).
  - **Emptying home:** once the cached next date passes, prepare and review vanish for that course (A1).
  - **Vague error:** the only hint is a small grey «تعذّر التحديث», with no data age and no retry.
  - **First launch offline:** home is blank with a retry, the Courses tab is empty, and Notifications shows one OFF switch.
  - **Audio error:** offline playback says only «تعذّر تشغيل الصوت».
  - **Slow recovery:** after reconnecting, it takes up to 60 s.
- **Evidence:**
  - Screenshots: [`offline-cached-home.png`](screenshots/offline-cached-home.png), [`offline-first-launch.png`](screenshots/offline-first-launch.png), [`offline-no-cache-courses-blank.png`](screenshots/offline-no-cache-courses-blank.png), [`offline-play-error-truncated-title.png`](screenshots/offline-play-error-truncated-title.png).
  - `generatedAt` is never read by the app.
  - The retry is shown only when there is no state (`Home.tsx:38-43`).
  - `fetchLessons` has no timeout (`app/src/api.ts:32`).
- **Direction:**
  - Ignore cached `live` when it is older than ~10 min.
  - Show «لا يوجد اتصال · آخر تحديث قبل ٣ ساعات» with a retry.
  - Keep the latest recording reviewable offline.
  - Show «التسجيل يحتاج اتصالًا» when audio fails offline.
  - Refresh on the network-change event.
  - Give the tabs offline defaults.
- **Effort:** S

### X2. Contrast and text size are too low for this audience
- **Impact:** Much of the UI is 11–12 px muted brown. Inactive nav labels are at 2.08:1 contrast, which fails WCAG AA, and faded ticks and the disabled pager are at ≈2.1–2.3:1. Many listeners are older. Text scales with the system font, but icons stay at a fixed size.
- **Evidence:** Sampled `#b69b70` on `#ece3cf` (`.nav a { opacity: .55 }`, `app.css:85`). Font sizes at `app.css:18,19,28,47,71,84`. [`large-font-home.png`](screenshots/large-font-home.png).
- **Direction:** Base UI text at 13–14 px, an active tab shown by colour and weight rather than opacity, and icons sized in `em`.
- **Effort:** S

### X3. The mini player cuts off the lesson number
- **Impact:** For Kitab at-Tawhid the title is truncated to «… · الد…». The lesson number, the one thing that tells lessons apart, is cut off. At font scale 2.0 the subtitle wraps to 3 lines and eats the book page.
- **Evidence:** [`offline-play-error-truncated-title.png`](screenshots/offline-play-error-truncated-title.png), [`large-font-book-viewer.png`](screenshots/large-font-book-viewer.png). `app.css:91-92`. The title is built in `App.tsx:22`.
- **Direction:** Put the lesson number first, or use a short course name, and clamp the subtitle to one line.
- **Effort:** S

### D1. Docs and code that will slow future work
- **The schedule rule is implemented twice:** in `server/src/schedule.ts` and `app/src/logic/home.ts`, with different precedence (S8).
- **Page numbers mean "PDF page index" everywhere:** in the DTOs, the agent and the admin page. This is written down nowhere, and `pdfIndex` is 0-based (A2, AD1).
- **Unused DTO fields:** `NextPassageDTO.estimated`, `LiveDTO.startedAt` and `StateDTO.generatedAt` are documented in `shared/src/api.ts` but unused by the app, so readers will assume they drive the UI.
- **The fixture has drifted from production:** `app/src/dev/fixture-state.ts` gives Tafsir a PDF, while production uses `edition` with no PDF, and it uses the old fixed times. The page-only path is never exercised in dev or tests.
- **`app/README.md` covers only builds.** It does not mention `?fixture=1`/`?now=`, that the book viewer can't work in the browser dev server (al-badr.net sends no CORS headers; native uses CapacitorHttp), or the push data contract and tap routing.
- **`server/README.md` misses the operating details:**
  - the cron jobs and their cadence;
  - the `sent_notifications` keys and how to resend a push;
  - how `expectedNextNumber` infers numbers;
  - how to fix a mis-ingested lesson;
  - page chaining between lessons.
- **`agent/README.md` misses its dependencies and procedures:**
  - the logged-in `claude` CLI dependency;
  - the system tools (`ffmpeg`, poppler, `tesseract` with `ara`);
  - the cache layout;
  - how to force a re-locate;
  - `ALBADR_AGENT_LOCK`.
- **Plans have drifted from the code:**
  - The agent plan's constraints contradict the code: `end_pdf_index`, next-start matching, Tafsir label stripping and `_find_in_surah` are undocumented. A short "how locating works" section is needed.
  - The home rules in the mobile plan (Task 3) have drifted from `home.ts`.
- **Effort:** S

---

## Later

### X4. TalkBack
Lines are read as fragments, for example «درس» / «الفجر» / «· الدرس» / «٤٥٣» as four stops. The current tab has no selected state (`NavBar.tsx:14`, no `aria-current`). The home controls remain reachable under the live sheet (`LiveSheet.tsx`, no `aria-modal` or `inert`). Labels themselves are present and in Arabic. **Direction:** build each line as one string, add `aria-current="page"`, and add `aria-modal` plus `inert` on the background. S. Raise to Should if store accessibility review requires it.

### X5. System bars and splash
The status and navigation bars stay grey in dark mode (`#303030` over a plum app) and white in light mode. `StatusBar.setBackgroundColor` has no effect under edge-to-edge (`chrome.ts:11`); see [`dark-home-grey-system-bars.png`](screenshots/dark-home-grey-system-bars.png). The Android 12+ splash is lavender-grey and then jumps to cream, because `windowSplashScreenBackground` is not set. **Direction:** draw the app under the bars with safe-area insets, and set the splash background per theme in `styles.xml`. S.

### H6. Unknown start page opens the cover
When no start page is known, «اقرأ في الكتاب» opens vol. 1, page 1, with no hint ([`sim-unknown-page-opens-cover.png`](screenshots/sim-unknown-page-opens-cover.png), `format.ts` `bookHref`). **Direction:** open where the previous lesson ended, or show «لم تُحدَّد الصفحة بعد» and the last page the student viewed. S.

### H7. Night view of «دروس اليوم»
After Maghrib it lists two «انتهى» and nothing about tomorrow, and the hero says «حضّر لدرس الفجر غدًا» with no time ([`home-today-all-finished.png`](screenshots/home-today-all-finished.png), `Home.tsx:141`). **Direction:** switch the section to «الدروس القادمة» after the last lesson of the day, and add the time to the tag. S.

### H8. Links screen
The hostnames are left-aligned under right-aligned titles (`Links.tsx:27`). «مجتمع واتساب ١/٢» are unexplained. Their invite pages show both groups as «دروس الشيخ عبد الرزاق البدر», numbered (٢) and (٥): copies of the same group, so a student need join only one. There is no «عن التطبيق» entry with the version and a feedback link ([`links.png`](screenshots/links.png)). **Direction:** align the hostnames right, and replace the two WhatsApp rows with one «مجموعة واتساب للدروس» row that says the groups are copies (Q5). Add an about row. S.

### S10. Reminder catch-up
If the cron misses the 5-minute window (`jobs/reminders.ts:89,95-96`), that day's prep reminder is lost. **Direction:** send when `now ≥ target` and not yet sent, up to the lesson time. S.

### S11. Duplicate "other live" pushes and detection latency
For non-course broadcasts the dedupe key is the uid (`live:${uid}`, `jobs/live.ts:55`), so a reconnect sends «بث مباشر الآن» twice. In the worst case the home screen shows live about 2.5 min after the start (1-min cron, 15 s cache, 60 s foreground poll). **Direction:** dedupe by date and slot. S.

### S12. Older lessons
The course page lists only scraped lessons (Tafsir 441–453). `server/README.md` says "repeat to fill older recordings", but repeating only fills mp3 URLs (`sources/albadr.ts:61-76`). **Direction:** no backfill in v1, because an archive is a non-goal (Q9). Fix the README wording. S.

### S13. Smaller robustness points
- Book and transcript caches are keyed by URL (`agent/.../books.py:72`, `transcribe.py:124`), so a file replaced at the same URL is never re-read.
- Rejected lessons leave their audio in the cache (`cli.py:140`).
- Worker fetches to al-badr.net have no timeout and no identifying User-Agent (`sources/albadr.ts:55-58`).
- Hijri mapping uses Umm al-Qura. A sighting-adjusted date at a month boundary could put the live push's lesson number off by one (`time.ts`), and «تم التسجيل اليوم» could mis-match (`home.ts`).

S.

### D2. Fixture states can't be reached on a device build
`?fixture=1` and `?now=` are gated on `import.meta.env.DEV` (`store.ts:21`), so live, missing-recording and exception states get little real-device testing, and several bugs above live there. **Direction:** add a debug-build switch that loads a chosen fixture and clock. S.

---

## Suggested order

1. **Silent failures and public mistakes** (cheap, protects everything else): O3, S1, O1, O2, S5, S6, S4.
2. **The study cycle itself:** B1 (verify on a real phone first), P1, L1 with L2, H1, T1 (label), S2, A1, A3.
3. **Owner decisions,** then A2, S9, N1, H3.
4. **The Should list,** in table order. Ticket each must item before starting it.

## Decisions on the review questions

The review raised 14 questions. Ten are answered below with a default that follows the spec or standard practice; the owner can still overturn any of them. Numbers match the (Qn) references above.

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | Printed or PDF page numbers? | **Printed.** Keep the PDF index internally, add `pageOffset` per volume, and convert only when opening the viewer (A2). | A page number shown to a person means the number on the page. Tafsir already works this way. |
| 2 | Medina or local time? | **Both:** device-local first, «بتوقيت المدينة» second; day words follow the device date. **Reminders stay at fixed Medina times** (T1). | The spec sets fixed Medina reminder times for v1. Per-zone reminders are a later item. |
| 3 | Skip the prep reminder after a lesson that didn't air? | **No, keep sending it.** The requester enters cancellations through the admin page, as the spec says for v1 (S2). | A missed reminder costs more than a spurious one, and the in-app phantom states are fixed separately. |
| 4 | Cancellation wording, and a push? | **The app's own wording,** with the admin's note appended, **plus a push** to the course's live topic (H3). | Those subscribers would otherwise wait for a live that won't come. |
| 5 | WhatsApp communities 1 and 2? | **Copies of the same group:** the invite pages read «دروس الشيخ عبد الرزاق البدر (٢)» and «(٥)». Show one row that says so (H8). | Looked up. The app's "1/2" labels don't match the groups' own numbers. |
| 6 | Notification opt-in? | **A soft in-app ask; after the grant, topics stay on by default** (N1). | Matches the spec's default-on toggles and standard Android 13+ practice. |
| 7 | Live and book together? | **Build the collapsed live bar (L1),** and add the tester note now (L2). Before building, check Mixlr's embed terms for any visibility rule; if there is one, keep a small visible iframe in the bar. | The audio still comes from Mixlr's official embed; collapsing it is not re-transmission. |
| 8 | Ramadan 1448 times? | **Build the `retime` exception now (S9).** Enter the times from al-badr.net/streaming once they are announced. | Only the data is unknown, and it is not needed to build. |
| 10 | Count broadcasts in the window immediately? | **Yes, immediately,** with a ±30–45 min window and admin re-attribution (S7). | The live push can't wait for a confirmation. |
| 11 | al-badr.net vs admin? | **Admin wins,** via an `edited_by_admin` flag; the site updates everything else (S3). | Manual corrections are deliberate. |
| 12 | Operator, alerts, tester switch? | **The requester operates the admin page** (as the spec says). **Alerts go to Telegram.** **No tester switch:** debug builds subscribe to a `test` topic and release builds never do (O1, O2, O3). | Standard practice; all three follow from the spec. |
| 13 | Tell students to use their own Tafsir copy? | **Yes:** «اقرأ من نسختك: ص N، طبعة دار ابن الجوزي», naming the edition, with no purchase link (H1). | The PDF is deliberately not linked. |

### Still open for the owner (none blocks the release list)

1. **Course history (Q9):** should a course list every earlier lesson of the current book (Tafsir 1–440)? Default for now: no backfill, because an archive is a non-goal, and the README gets fixed (S12).
2. **Offline downloads (Q14):** should students be able to download recordings for offline listening? Default: out of v1 scope.
3. **Ramadan 1448 times (Q8):** the actual lesson times and days, once announced.
