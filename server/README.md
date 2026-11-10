# Server

Cloudflare Worker + D1, served at `api.albadrmubasher.com`.

```sh
export CLOUDFLARE_ACCOUNT_ID=9ab550becc556ce60d4250bfdc48224c

pnpm --filter server exec wrangler d1 migrations apply albadr-lessons --remote
pnpm --filter server exec wrangler deploy
```

## Secrets

```sh
pnpm --filter server exec wrangler secret put ADMIN_TOKEN < ~/.config/albadr-lessons/admin-token
pnpm --filter server exec wrangler secret put FCM_SERVICE_ACCOUNT < ~/.config/albadr-lessons/firebase-service-account.json
```

## Backfill

```sh
curl -X POST -H "Authorization: Bearer $(cat ~/.config/albadr-lessons/admin-token)" \
  https://api.albadrmubasher.com/api/admin/run/ingest
```

Each run fetches at most 8 recording detail pages per course; repeat to fill older recordings.
