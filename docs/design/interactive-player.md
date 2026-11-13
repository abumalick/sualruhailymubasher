# Interactive recordings player — design

## Intent
Listeners revising a recorded lesson need to move inside it: replay a passage they missed, skip ahead, jump
to a point. Today the mini player's progress line is display-only.

## Goals
- A scrubber for recordings: tap to jump, grab and drag to move; current time and duration shown in Arabic digits.
- Back 15 s and forward 15 s buttons.
- The media notification / lock screen gets seek backward / forward 15 s next to the existing seekto.

## Non-goals
- No change to the live stream (its mini player markup stays as it is).
- No full-screen player, no playback speed, no remembering positions.

## Constraints
- Arabic RTL app, phones 320–390 px wide, the phone's text-size setting, touch targets ≥ 44 px, dragging must not scroll the page.
- The onboarding preview draws the real mini player: keep `.mp`, `.mini`, `.t`, `.b`, `.m`, `.prog`.
- Decisions in pure functions (`app/src/logic/seek.ts`), the component and the player stay thin.

## Approaches
1. **Custom pointer scrubber (chosen).** A `role="slider"` element with pointer capture, a 44 px hit area around a thin
   rail, `touch-action: none` on that area only, keyboard arrows. Full control of look and RTL, one seek on release.
2. `<input type="range">`: native a11y, but styling the thumb and track differs across Chromium/WebKit and its RTL
   behaviour follows `dir`, which is what we want to pin. More CSS than code saved.
3. Seek on every pointermove: feels live but floods range requests on a network MP3 and fights `timeupdate`.

## Decisions
- **RTL: playback is not mirrored.** The bar fills left → right, elapsed time on the left, duration on the right,
  back-15 on the left (counter-clockwise arrow), forward-15 on the right. Material's bidirectionality guidance keeps
  media progress and transport controls in tape direction; the app already does (the play triangle points right and
  today's progress line grows from the left). The scrubber row is `dir="ltr"`; the drag→time function takes the
  direction explicitly.
- Layout for recordings: two rows. Row 1: [−15][play][+15] at the start (right), title and lesson to the left.
  Row 2: elapsed · rail · duration. Live keeps today's single row.
- When the player is narrower than 24 em of its caption size (a 320 px phone, or larger text from the phone's
  setting), the times go under the bar and the bar takes the whole width. The query is in `em`, so it follows the
  text size.
- Each time label reserves the width of its widest possible text (its shape written in every digit): the UI font's
  Arabic digits differ in width, and a label that grows as the time counts up would slide the bar under a dragging
  finger.
- Drag keeps a local position; `player.seek` is called once on release (a tap is a down + up). `pointercancel` reverts.
  While dragging, the elapsed label shows the drag time.
- Disabled (scrubber and skips) while the duration is unknown.
- Seek clamps to [0, duration]; skip = clamp(position ± 15).
- Time format: `m:ss`, `h:mm:ss` when the recording is an hour or longer (both labels then use hours so they keep
  their width); unknown → `--:--`. Arabic-Indic digits, tabular.
- Media Session: `seekbackward` / `seekforward` handlers skip 15 s; they are registered on the first recording played,
  so a listener who only follows the live stream never gets the buttons (the plugin offers no unregistering on
  Android). On live they do nothing. The Android plugin's notification icons read "30": the app overrides those two
  drawables with "15" versions.

## Left to the builder
- Exact sizes and spacing, within the constraints above.
- Android's notification seek bar follows the system locale; whether it mirrors in Arabic is checked on the phone.
- iOS lock-screen skip interval: the plugin sets no `preferredIntervals`; not verifiable without an iPhone.
