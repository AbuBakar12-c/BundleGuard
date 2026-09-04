# BundleGuard — Production deploy

**Primary host: [Render](https://render.com)** (see [render-deploy.md](./render-deploy.md)).

Railway and Fly remain optional alternatives (`railway.toml` / `fly.toml`).

Local dev stays on **SQLite**. Production uses **Postgres**.

---

## Quick path (Render)

1. Fill `production.inputs.env` from `docs/production-inputs.example.env`
2. Push repo to GitHub; follow **[render-deploy.md](./render-deploy.md)** (Blueprint + Postgres + env)
3. Apply URL:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\set-production-url.ps1 -Url https://YOUR_SERVICE.onrender.com
   npx shopify app deploy --config shopify.app.toml
   ```
4. Smoke:
   ```powershell
   npm run smoke:prod -- https://YOUR_SERVICE.onrender.com
   ```

---

## Prerequisites

- Shopify **Partner** organization app (not shop-owned) for live Billing
- Render account with payment method (starter web service — avoid free sleep)
- Rotated `SHOPIFY_API_SECRET` / `OPENAI_API_KEY` if they were ever exposed
- `SUPPORT_EMAIL` / `COMPANY_NAME` set on the host

---

## B. Point Shopify at your host

```toml
application_url = "https://YOUR_APP.onrender.com"

[auth]
redirect_urls = [
  "https://YOUR_APP.onrender.com/auth/callback",
  "https://YOUR_APP.onrender.com/auth/shopify/callback",
  "https://YOUR_APP.onrender.com/api/auth/callback",
]
```

Then: `npx shopify app deploy --config shopify.app.toml`

---

## Why not Vercel?

This app is a long-running Node server (`react-router-serve`) with webhooks and Prisma sessions. Vercel needs a serverless adapter rewrite — out of scope for first go-live.
