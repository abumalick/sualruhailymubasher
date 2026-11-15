# sualruhaily-agent

Install the scheduled run (needs `~/.config/sualruhailymubasher/agent.env` with `API_BASE` and `ADMIN_TOKEN`):

```sh
cp systemd/sualruhaily-agent.service systemd/sualruhaily-agent.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now sualruhaily-agent.timer
systemctl --user start sualruhaily-agent.service   # run once now
journalctl --user -t sualruhaily-agent -n 50   # heavy moves the job into a transient scope, so `-u sualruhaily-agent` misses its logs
```

## Ingest

`sualruhaily-agent ingest` reads the official channel @Sulalruhaily through its own Telethon user session (the owner's account), uploads each
lesson recording to R2 (`lessons/<course>/<message id>.<mp3|m4a>`) through the admin API and creates the lesson.
Kaba'ir posts link to the official site: the lesson number, start point and mp3 come from the play page. Absence
and lecture posts become slot cancellations. Posts are keyed by `tg:<message id>`, so a second pass changes
nothing; a repost of an ingested lesson is skipped, a corrected caption moves the lesson without a re-upload.

```sh
uv run sualruhaily-agent ingest [--from-id N] [--no-notify] [--dry-run] [--retry-failed]
```

- `--from-id N` exports from message N; otherwise from the last 150 ids before the highest one seen (from 859,
  the first 1448 lesson, on the first run).
- `--no-notify` never pushes the lessons this run posts (for a backfill).
- `--dry-run` prints the planned actions and writes nothing: no upload, lesson, cancellation, heartbeat or state.
- `--retry-failed` retries the posts that failed permanently on an earlier run (see below).

The first run (no `ingest/state.json` yet) is a backfill: it never pushes, whatever the flags say. A post that fails
the same way on every try (the server refuses it with 400/409/413/415, a file over 95 MB, an unusable play page)
is recorded in the state and skipped, still counted as failed in the heartbeat, until `--retry-failed`. Server
errors, network errors and Telegram failures are retried on the next run.

It needs `API_BASE` and `ADMIN_TOKEN`; `SUALRUHAILY_AGENT_CACHE` moves its lock (`ingest.lock`), state
(`ingest/state.json`) and downloads. Telegram needs `TELEGRAM_API_ID` and `TELEGRAM_API_HASH`; the session file is
`TELEGRAM_SESSION` (default `~/.config/sualruhailymubasher/telegram.session`), used by no other tool. A run from a worktree must set its own `TELEGRAM_SESSION` (logged in separately) or
run between timer ticks: two processes using one session at once can get it revoked. Log it in once
with `sualruhaily-agent telegram-login` (it asks for the phone number and the code Telegram sends). A run that
finds the session busy, or that Telegram asks to wait (flood wait), is skipped. Each run ends with a heartbeat
(`3 lessons, 1 cancellation, 2 skipped, 0 failed`), not ok when a post failed or a caption was not understood.
"skipped" counts every post that is not a lesson or a cancellation (live-stream notices, khutbas, reposts…).

A post that fails retryably 5 times in a row becomes permanent too (`failed:retries:<last reason>`); a success
resets its count. A cancellation that matched courses is remembered, so one the owner deletes in /admin does not
come back. An early 4xx from the media route (the Worker answers before reading the whole body) can reach the
agent as a transport error instead of the status: it is then retried, within that cap of 5.

The timer runs it every 20 minutes. Install it only after the backfill. The manual run and the timer share the
default cache (`~/.cache/sualruhaily-agent/`, where `ingest/state.json` lives), so do not set
`SUALRUHAILY_AGENT_CACHE` for production. Load the environment, look at the plan, run the backfill, review the
lessons in /admin, then enable the timer:

```sh
set -a; . ~/.config/sualruhailymubasher/agent.env; set +a
uv run --frozen --project ~/workspace/dawa/ruhaylimubasher/agent sualruhaily-agent ingest --from-id 859 --dry-run
uv run --frozen --project ~/workspace/dawa/ruhaylimubasher/agent sualruhaily-agent ingest --from-id 859 --no-notify
```

```sh
cp systemd/sualruhaily-ingest.service systemd/sualruhaily-ingest.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now sualruhaily-ingest.timer
journalctl --user -t sualruhaily-ingest -n 50
```

A course whose book must not be linked from the app (no public PDF) can still be located: list its local
PDF files in `agent.env`, one course per `;`, volumes in order separated by `,`:

```sh
SUALRUHAILY_LOCAL_BOOKS=tafsir-saadi=/home/me/.local/share/sualruhaily-agent/books/tafsir-saadi-ibn-aljawzi.pdf
```

The first index of a scanned book OCRs every page and can take hours; pages are saved as they are read, so a
run that times out resumes where it stopped. To index ahead of the timer: `uv run sualruhaily-agent index-book <path>`.

## The next lesson's start

A lesson's `end_point` is shown as the next lesson's start (home prepare card, 21:00 reminder). When the next
lesson is already published, the agent stores its start point unchanged. Otherwise it comes from the recording:

- **Tafsir lessons** (a start point of the form `تفسير سورة …: من الآية (N) ﴿…﴾`) each open with an ayah, so the
  end point is the next ayah written the way the channel announces it. Claude names the surah, ayah number and
  opening words; the agent checks the words against the Quran text, checks the ayah comes after the lesson's own
  start, and writes the opening from the Quran text, closed with ﴾. If the check fails it leaves the end point
  unset (the pages are still saved) and logs a warning; the app then shows «يتابع من حيث توقف الدرس N». A Tafsir
  start is never a book passage.
- Each run also compares every recent Tafsir lesson's end point with the next lesson's published start point,
  and replaces it when they differ, so a predicted start corrects itself once the next lesson is published.
- **Book courses** keep the opening of the next unread sentence in the book («من قوله: …»), cut on a word with «…».

The Quran text in `src/sualruhaily_agent/data/` is the Tanzil Project's Simple text and metadata
([tanzil.net](https://tanzil.net), CC BY 3.0), kept verbatim as its terms require.
