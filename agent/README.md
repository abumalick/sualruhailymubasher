# albadr-agent

Install the scheduled run (needs `~/.config/albadr-lessons/agent.env` with `API_BASE` and `ADMIN_TOKEN`):

```sh
cp systemd/albadr-agent.service systemd/albadr-agent.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now albadr-agent.timer
systemctl --user start albadr-agent.service   # run once now
journalctl --user -t albadr-agent -n 50   # heavy moves the job into a transient scope, so `-u albadr-agent` misses its logs
```

A course whose book must not be linked from the app (no public PDF) can still be located: list its local
PDF files in `agent.env`, one course per `;`, volumes in order separated by `,`:

```sh
ALBADR_LOCAL_BOOKS=tafsir-saadi=/home/me/.local/share/albadr-agent/books/tafsir-saadi-ibn-aljawzi.pdf
```

The first index of a scanned book OCRs every page and can take hours; pages are saved as they are read, so a
run that times out resumes where it stopped. To index ahead of the timer: `uv run albadr-agent index-book <path>`.

## The next lesson's start

A lesson's `end_point` is shown as the next lesson's start (home prepare card, 21:00 reminder). When the next
lesson is already published, the agent stores its start point unchanged. Otherwise it comes from the recording:

- **Tafsir lessons** (a start point of the form `تفسير سورة …: من الآية (N) ﴿…﴾`) each open with an ayah, so the
  end point is the next ayah written the way the channel announces it. Claude names the surah, ayah number and
  opening words; the agent checks the words against the Quran text, checks the ayah comes after the lesson's own
  start, and writes the opening from the Quran text, closed with ﴾. If the check fails it keeps the book sentence
  and logs a warning.
- **Book courses** keep the opening of the next unread sentence in the book («من قوله: …»), cut on a word with «…».

The Quran text in `src/albadr_agent/data/` is the Tanzil Project's Simple text and metadata
([tanzil.net](https://tanzil.net), CC BY 3.0), kept verbatim as its terms require.
