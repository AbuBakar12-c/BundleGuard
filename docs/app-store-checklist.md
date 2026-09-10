# App Store pre-submission checklist

Updated Sep 10, 2026. See also `docs/production-readiness.md`.

## Automated / code-backed

- [x] Embedded app (`embedded = true`)
- [x] Shopify Billing via Billing API (plans in `billing.server.ts`)
- [x] Mandatory compliance webhooks in TOML → `/webhooks/compliance`
- [x] Uninstall purge of shop PII/data
- [x] Privacy policy page at `/privacy` (SUPPORT_EMAIL / COMPANY_NAME)
- [x] App proxy configured for Shopper AI
- [x] Shopper proxy **Pro-gated** (loader + action)
- [x] Centralized entitlements service
- [x] Lead CRM charts on Shopper page
- [x] Listing draft (`docs/app-store-listing.md`)
- [x] Scopes minimized (`write_inventory` removed)
- [x] Secrets scrubbed from `.env.example`; `.dockerignore` excludes `.env`
- [x] Production boot guards (URL / SQLite / billing-test)
- [x] Health `/healthz` + readiness `/readyz`
- [x] Docker + Render Blueprint (`render.yaml`)
- [x] `npm run doctor` / `test:critical` / `deploy:check`

## Must complete on your side before submit

- [ ] Deploy to stable HTTPS host (Render — see `docs/render-deploy.md`)
- [ ] Replace `REPLACE_WITH_PRODUCTION_HOST` via `scripts/set-production-url.ps1`
- [ ] Set host `SHOPIFY_APP_URL` + Postgres `DATABASE_URL`
- [ ] `SHOPIFY_BILLING_TEST=false` on host
- [ ] `npx shopify app deploy --config shopify.app.toml`
- [ ] Partner-owned app for live charges
- [ ] Privacy URL in Partner listing = `https://YOUR_HOST/privacy`
- [ ] App Store screenshots + listing copy
- [ ] Rotate any previously exposed API secrets
- [ ] Fresh development-store install smoke test
- [ ] `npm run smoke:prod -- https://YOUR_HOST`

## Plan gating (marketing must match)

| Plan | Features |
|------|----------|
| Starter | Dashboard, resync, 10 bundles |
| Growth | + OOS audit, merchant AI, alerts |
| Pro | + location audit, Shopper AI, unlimited |
