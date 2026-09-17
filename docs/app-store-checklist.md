# App Store pre-submission checklist

Updated Sep 17, 2026. See also `docs/production-readiness.md`.

## Automated / code-backed

- [x] Embedded app (`embedded = true`)
- [x] Shopify Billing via Billing API (plans in `billing.server.ts`)
- [x] Billing enforced on **every** mutating admin action, not only the app-wide
      layout loader — `authenticateAdminWithBilling()` in `shopify.server.ts`,
      a lapsed/declined subscription can no longer keep using resync/delete
      via a direct fetcher POST (fixed Sep 2026 audit; regression-guarded by
      `scripts/critical-path-tests.ts`, wired into CI)
- [x] Mandatory compliance webhooks in TOML → `/webhooks/compliance`
- [x] `app_subscriptions/update` webhook registered (both TOMLs) so a plan
      cancellation/downgrade is logged as soon as Shopify reports it
- [x] Uninstall purge of shop PII/data
- [x] Webhook handler failures (uninstall purge, GDPR redact/export, order
      and inventory sync, session scope update) are structured-logged and
      optionally alertable via `OPS_ALERT_WEBHOOK_URL` — previously only a
      `console.error` line nobody was watching
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
- [x] `test:critical` now runs in CI on every push/PR (`.github/workflows/ci.yml`)
- [x] Client-facing errors on bundle create/delete/resync no longer leak raw
      Prisma/internal exception text — only pre-curated merchant-safe
      messages are shown verbatim (`UserFacingError` / `safeActionError`)

## Must complete on your side before submit

- [x] Deploy to stable HTTPS host (Render — `https://bundleguard-24n6.onrender.com`)
- [x] Production URLs in `shopify.app.toml` (not placeholder)
- [ ] Confirm Render Dashboard `SHOPIFY_APP_URL` = `https://bundleguard-24n6.onrender.com`
- [x] Host Postgres via Render + `/readyz` db:up
- [x] `SHOPIFY_BILLING_TEST=false` in production vars file
- [x] Active app version released (bundleguard-6+)
- [ ] Partner **Public** distribution (required for Billing API charges)
- [ ] Privacy URL in Partner listing = `https://bundleguard-24n6.onrender.com/privacy`
- [ ] App Store screenshots + listing copy
- [ ] Rotate any previously exposed API secrets
- [ ] Fresh development-store install + Plan trial smoke test
- [x] `npm run smoke:prod -- https://bundleguard-24n6.onrender.com`
- [ ] **New this session:** run `npx shopify app deploy --config shopify.app.toml`
      to register the added `app_subscriptions/update` webhook subscription
      with Shopify — the TOML change alone does not reach Shopify until deployed

## Plan gating (marketing must match)

| Plan | Features |
|------|----------|
| Starter | Dashboard, resync, 10 bundles |
| Growth | + OOS audit, merchant AI, alerts |
| Pro | + location audit, Shopper AI, unlimited |
