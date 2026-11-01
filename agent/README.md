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
