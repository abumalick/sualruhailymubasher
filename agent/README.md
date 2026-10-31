# albadr-agent

Install the scheduled run (needs `~/.config/albadr-lessons/agent.env` with `API_BASE` and `ADMIN_TOKEN`):

```sh
cp systemd/albadr-agent.service systemd/albadr-agent.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now albadr-agent.timer
systemctl --user start albadr-agent.service   # run once now
journalctl --user -t albadr-agent -n 50   # heavy moves the job into a transient scope, so `-u albadr-agent` misses its logs
```
