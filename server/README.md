# Server

Cloudflare Worker + D1, served at `api.sualruhailymubasher.com`.

```sh
export CLOUDFLARE_ACCOUNT_ID=9ab550becc556ce60d4250bfdc48224c

pnpm --filter server exec wrangler d1 migrations apply sualruhaily-lessons --remote
pnpm --filter server exec wrangler deploy
```

## Secrets

```sh
pnpm --filter server exec wrangler secret put ADMIN_TOKEN < ~/.config/sualruhailymubasher/admin-token
pnpm --filter server exec wrangler secret put FCM_SERVICE_ACCOUNT < ~/.config/sualruhailymubasher/firebase-service-account.json
```
