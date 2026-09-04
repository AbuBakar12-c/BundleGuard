# App Store pre-submission checklist (local)

Updated after Phase 1–3 hardening.

## Automated / code-backed

- [x] Embedded app (`embedded = true`)
- [x] Shopify Billing via Billing API (plans in `billing.server.ts`)
- [x] Mandatory compliance webhooks in TOML → `/webhooks/compliance`
- [x] Uninstall purge of shop PII/data
- [x] Privacy policy page at `/privacy`
- [x] App proxy configured for Shopper AI
- [x] Lead CRM charts (7-day + funnel) on Shopper page
- [x] Listing draft updated for AI + plan gates (`docs/app-store-listing.md`)
- [x] Scopes minimized (`write_inventory` removed)
- [x] Secrets scrubbed from `.env.example`; `.dockerignore` excludes `.env`
- [x] Production boot guards for URL / secrets
- [x] Health check `/healthz`

## Must complete on your side before submit

- [ ] Deploy to stable HTTPS host (`fly deploy` — see `docs/production-deploy.md`)
- [ ] Replace `application_url` / `SHOPIFY_APP_URL` (no `example.com`)
- [ ] `shopify app deploy` so compliance webhooks register on the version
- [ ] Postgres `DATABASE_URL` + `npm run db:postgres` then `prisma db push`
- [ ] `SHOPIFY_BILLING_TEST=false` on host
- [ ] Partner-owned app for live charges
- [ ] Put real support email in `/privacy`
- [ ] App Store listing screenshots + privacy URL
- [ ] Rotate any previously exposed API secrets
- [ ] Test install on a fresh development store
- [ ] Run `npm run deploy:check` before go-live

## Plan gating (marketing must match)

| Plan | Features |
|------|----------|
| Starter | Dashboard, resync, 10 bundles |
| Growth | + OOS audit, merchant AI, alerts |
| Pro | + location audit, Shopper AI, unlimited |

See `docs/production-deploy.md` for host steps.
