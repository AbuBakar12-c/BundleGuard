# BundleGuard — Railway production deploy

Primary host for go-live (plan default). Vercel is **not** used (serverless rewrite required).

## Prerequisites (you)

1. [Railway](https://railway.app) account
2. Shopify **Partner-owned** app (live Billing)
3. Filled `production.inputs.env` (from `docs/production-inputs.example.env`)
4. Shopify + OpenAI credentials ready to paste into Railway Variables

## A. One-time Railway setup (you)

### Option 1 — CLI bootstrap (fastest)

```powershell
npm i -g @railway/cli   # already OK if `railway --version` works
railway login --browserless
powershell -ExecutionPolicy Bypass -File .\scripts\railway-bootstrap.ps1
```

Then set Variables (dashboard or `railway variables set …`) from the table below.

### Option 2 — Dashboard

1. Create a new Railway project → **Empty project**
2. **Add service** → **GitHub repo** (push this repo) **or** `railway up`
3. **Add Postgres**: project → **New** → **Database** → **PostgreSQL**
4. On the **web service**, open **Variables**:
   - Link `DATABASE_URL` from the Postgres service (Railway reference variable)
   - Set:

| Variable | Value |
|----------|--------|
| `NODE_ENV` | `production` |
| `SHOPIFY_BILLING_TEST` | `false` |
| `SHOPIFY_API_KEY` | Partner client ID |
| `SHOPIFY_API_SECRET` | Partner secret |
| `SCOPES` | `read_products,write_products,read_inventory,read_locations,read_orders,write_app_proxy` |
| `SHOPIFY_APP_URL` | `https://YOUR_SERVICE.up.railway.app` (after public domain exists) |
| `OPENAI_API_KEY` | your key |
| `SUPPORT_EMAIL` | your support email |
| `PRIVACY_EMAIL` | same or privacy inbox |
| `COMPANY_NAME` | your name / company |

5. **Settings → Networking → Generate domain** → copy the HTTPS URL  
6. Set `SHOPIFY_APP_URL` to that exact URL (no trailing slash)  
7. Redeploy if the URL was set after first boot  

Build uses the repo [Dockerfile](../Dockerfile) via [railway.toml](../railway.toml) (Postgres Prisma client + `docker-start`). Nixpacks fallback: [nixpacks.toml](../nixpacks.toml).

## B. Wire Shopify (after you have the HTTPS URL)

On your machine:

```powershell
# production.inputs.env must include PRODUCTION_APP_URL=https://….up.railway.app
powershell -ExecutionPolicy Bypass -File .\scripts\apply-production-inputs.ps1

# or only URL:
powershell -ExecutionPolicy Bypass -File .\scripts\set-production-url.ps1 -Url https://YOUR_SERVICE.up.railway.app

npx shopify app deploy --config shopify.app.toml
```

Confirm in Partner Dashboard: App URL + redirect URLs match Railway.

Reinstall / open the app on the dev store — you must **not** see Example Domain.

## C. Smoke

```powershell
npm run smoke:prod -- https://YOUR_SERVICE.up.railway.app
```

Expect `/healthz`, `/readyz`, `/privacy` OK.

## D. Local SQLite after Postgres schema switch

Docker/Railway builds may leave `prisma/schema.prisma` as `postgresql` in the **image** only. Your local working tree should stay sqlite for `shopify app dev`:

```powershell
npm run db:sqlite
# DATABASE_URL=file:dev.sqlite in .env
npx prisma generate
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `/readyz` 503 | Postgres not linked or `DATABASE_URL` wrong |
| Boot crash: SQLite / example.com | Set real `SHOPIFY_APP_URL` + Postgres; `SHOPIFY_BILLING_TEST=false` |
| Shopper AI 402 | Expected without Pro when billing enforced |
| OAuth Example Domain | `shopify app deploy` with updated TOML not run |

## Why not Vercel?

This app is a long-running Node server (`react-router-serve`) with webhooks and Prisma sessions. Vercel requires a serverless adapter rewrite — out of scope for this go-live.
