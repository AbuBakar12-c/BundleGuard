# BundleGuard — Render production deploy

Primary host for go-live. Uses the repo [Dockerfile](../Dockerfile) + managed Postgres.

Free web services **sleep** and break Shopify webhooks — this Blueprint uses **starter** (always on).

## A. Deploy (recommended)

1. Push this repo to GitHub (private is fine).
2. Open [Render Blueprints](https://dashboard.render.com/blueprints) → **New Blueprint Instance**.
3. Select the GitHub repo → confirm `render.yaml`.
4. Fill the **sync: false** env vars when prompted (or after deploy under service → Environment):

| Variable | Value |
|----------|--------|
| `SHOPIFY_API_KEY` | Partner client ID |
| `SHOPIFY_API_SECRET` | Partner secret |
| `SHOPIFY_APP_URL` | `https://bundleguard.onrender.com` (exact service URL after create) |
| `OPENAI_API_KEY` | your key |
| `SUPPORT_EMAIL` | support inbox |
| `PRIVACY_EMAIL` | privacy inbox |
| `COMPANY_NAME` | your name / company |

`DATABASE_URL`, `NODE_ENV`, `SHOPIFY_BILLING_TEST`, and `SCOPES` come from the Blueprint.

5. Wait for deploy green. Health check is `/readyz`.
6. Copy the public HTTPS URL (e.g. `https://bundleguard-xxxx.onrender.com`).

## B. Wire Shopify

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\set-production-url.ps1 -Url https://YOUR_SERVICE.onrender.com
npx shopify app deploy --config shopify.app.toml
```

## C. Smoke

```powershell
npm run smoke:prod -- https://YOUR_SERVICE.onrender.com
```

## CLI helper

```powershell
npm run deploy:render
```

## Local SQLite after deploy work

```powershell
npm run db:sqlite
npx prisma generate
```
