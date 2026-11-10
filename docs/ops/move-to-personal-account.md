# Moving the back end to the personal Cloudflare account

The Worker and its D1 move from the "H2 Alliance" account (`4a9e8181f68f28dff664f9752a6d83cd`,
host `api.albadr.h2.limited`) to the personal account (`9ab550becc556ce60d4250bfdc48224c`,
host `api.albadrmubasher.com`). Firebase does not move.

## State before cutover

- New D1 `albadr-lessons` (`11ae0749-3428-4993-ba2e-16d6aea40336`, region EEUR) holds a copy of the old
  D1, schema and `d1_migrations` included, so `wrangler d1 migrations list --remote` has nothing pending.
- New Worker `albadr-lessons` is deployed with both secrets and the custom domain, and **no cron
  schedules**, so it sends no pushes and writes nothing.
- The old Worker still runs its crons on the old D1. Production has no users besides the owner, so
  the old host does not need to keep working after the cutover and gets no forwarding Worker.

Commands below run from `server/`. `H2_TOKEN` is an API token on the H2 account
(Workers Scripts and D1 edit). Wrangler's own login reaches only the personal account.
`h2.jsonc` is a minimal config for the old database:

```jsonc
{ "name": "albadr-lessons", "account_id": "4a9e8181f68f28dff664f9752a6d83cd",
  "d1_databases": [{ "binding": "DB", "database_name": "albadr-lessons", "database_id": "e31685de-4bd7-4beb-ac28-19527ed54b8d" }] }
```

## Cutover

Pick a time away from pushes that fire in a fixed window: the prep reminders at 12:30 and 18:00 UTC
(15:30 and 21:00 Medina, 5-minute windows) and the live lessons. 07:00–11:00 UTC is clear.

1. **Stop every writer to the old D1.** Stop the agent and let a running pass finish:
   `systemctl --user stop albadr-agent.timer`, then wait until
   `systemctl --user is-active albadr-agent.service` prints `inactive`. Make sure nobody is editing
   through the admin API or `/admin` page.
2. **Remove the old crons:**
   ```sh
   curl -X PUT -H "Authorization: Bearer $H2_TOKEN" -H 'content-type: application/json' --data '[]' \
     https://api.cloudflare.com/client/v4/accounts/4a9e8181f68f28dff664f9752a6d83cd/workers/scripts/albadr-lessons/schedules
   ```
   Confirm with a GET on the same URL (`"schedules": []`), then watch
   `CLOUDFLARE_API_TOKEN=$H2_TOKEN wrangler tail albadr-lessons -c h2.jsonc` until two minutes pass
   with no scheduled event. Writes are frozen from here.
3. **Copy the data** (about 20 s). Export the old D1, drop every table in the new one, import, then
   export the new one and compare byte for byte:
   ```sh
   CLOUDFLARE_API_TOKEN=$H2_TOKEN wrangler d1 export albadr-lessons --remote -c h2.jsonc --output old.sql
   wrangler d1 execute albadr-lessons --remote --json --command \
     "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' AND name <> 'sqlite_sequence'" \
     | jq -r '.[0].results[].name' | sed 's/.*/DROP TABLE IF EXISTS "&";/' > wipe.sql
   wrangler d1 execute albadr-lessons --remote --file wipe.sql --yes
   wrangler d1 execute albadr-lessons --remote --file old.sql --yes
   wrangler d1 export albadr-lessons --remote --output new.sql
   cmp old.sql new.sql
   ```
4. **Compare the APIs** of both hosts while neither has crons: `/api/state` (ignoring
   `generatedAt`), `/api/courses/<id>/lessons` for each course, and the admin GETs (`courses`,
   `exceptions`, `pending-transcriptions`). They must be equal.
5. **Turn the new crons on** by deploying `main` (its `wrangler.jsonc` carries `* * * * *`):
   `wrangler deploy`. Confirm the schedules API on the personal account lists `* * * * *`, and
   `wrangler tail albadr-lessons` shows a scheduled event within two minutes. The freeze ends here.
6. **Point the agent at the new host:** set `API_BASE=https://api.albadrmubasher.com` in
   `~/.config/albadr-lessons/agent.env`, run one pass with `systemctl --user start albadr-agent.service`,
   check `journalctl --user -t albadr-agent` for a clean run, then `systemctl --user start albadr-agent.timer`.
7. **Ship the app** built from `main` (its API base is `https://api.albadrmubasher.com`). Until it is
   installed, the old build shows the frozen old data.
8. **Prove no write was lost:** an hour later, export the old D1 again and `cmp` it with `old.sql`.
   Any difference is a write that reached the old database after the freeze; replay it on the new one.

The freeze lasts from step 1 to step 5: normally 3–5 minutes, most of it waiting for the old crons to
stop.

### Why nothing is lost or sent twice

- The agent is stopped, not cut off. Its work comes from `GET /api/admin/pending-transcriptions`, so
  a lesson it did not reach during the freeze is still pending on the new host.
- The recording ingest is idempotent (`insertLessonIfNew`, then fill missing MP3 URLs), so the first
  new run picks up anything published during the freeze.
- Every push is deduplicated through `sent_notifications`, which is copied in step 3. Neither Worker
  has crons between steps 2 and 5, so nothing is sent then. Afterwards only the new Worker sends, and
  it skips every key the old one already sent.
- A live broadcast that starts during the freeze is announced on the new Worker's first poll (the key
  is per course per day). A recording push is sent on the next ingest. Only a prep reminder can be
  missed outright, because its window is 5 minutes, hence the cutover time above.

## Rollback

The old Worker and D1 are never deleted, so rollback is re-enabling them:

1. Remove the new crons: PUT `[]` to the personal account's `.../workers/scripts/albadr-lessons/schedules`.
2. If the new D1 took writes worth keeping, copy it back with step 3 in reverse (export new, wipe
   old, import into old).
3. Restore the old crons: PUT `[{"cron":"* * * * *"}]` to the H2 account's schedules URL.
4. Set `API_BASE=https://api.albadr.h2.limited` in `agent.env` and restart the timer.
5. An app already built with the new host keeps calling it; rebuild with
   `VITE_API_BASE=https://api.albadr.h2.limited` if needed.
