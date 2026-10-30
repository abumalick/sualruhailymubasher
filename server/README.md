# Server

Cloudflare Worker + D1, served at `api.albadr.h2.limited`.

```sh
export CLOUDFLARE_ACCOUNT_ID=4a9e8181f68f28dff664f9752a6d83cd

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
  https://api.albadr.h2.limited/api/admin/run/ingest
```

Each run fetches at most 8 recording detail pages per course; repeat to fill older recordings.
