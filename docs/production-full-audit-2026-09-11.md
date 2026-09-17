# BundleGuard — Full Production & App Store Readiness Report

**Date:** Sep 11, 2026  
**Standard:** Real-merchant SaaS (not MVP)  
**Decision:** **GO WITH EXTERNAL CONFIGURATION**

---

## EXISTING FUNCTIONALITY INVENTORY

| Feature | Exists | Working | API | Database | UI | Tests | Risk |
| ------- | ------ | ------- | --- | -------- | -- | ----- | ---- |
| Shopify Install / OAuth | Y | Y | `/auth/*` | Session | Login / embedded | smoke | Med |
| Merchant Dashboard | Y | Y | `/app` | Bundle, Alert | `/app` | none | Low |
| Bundles CRUD + resync | Y | Y | `/app/bundles/*` | Bundle, Component | create/detail | critical plans | Med |
| Audits (OOS / location) | Y | Y | `/app/audits` | Bundle, Alert | audits tabs | none | Med |
| Merchant AI | Y | Y | `/app/chat`, `/app/ai` | ChatMessage | AI hub + chat | critical | Med |
| Shopper AI + proxy | Y | Y | `/apps/bundleguard/chat` | BuyerChat, Settings | theme + `/app/shopper` | critical | Med |
| Leads / CRM | Y | Y | shopper + proxy | ShopperLead | `/app/shopper` | smoke | Med |
| Catalog + quiz | Y | Y | via shopper | ephemeral cache | shopper widget | critical | Med |
| Billing / plans | Y | Code Y / Live blocked | `/app/pricing` | Shopify subs | Plan page | critical | **High** (Partner Public) |
| Webhooks | Y | Y | `/webhooks/*` | WebhookDelivery | n/a | smoke | Med |
| GDPR / privacy | Y | Y | compliance + `/privacy` | ComplianceExport | `/privacy` | smoke | Med |
| Theme extension | Y | Y | n/a | n/a | 2 blocks | none | Med |
| Health / ready | Y | **Verified live** | `/healthz` `/readyz` | DB ping | n/a | smoke | Low |
| Background jobs | N | n/a | n/a | n/a | n/a | n/a | High at scale |
| Docker / Render | Y | Live Render | n/a | Postgres in image | n/a | smoke | Med |
| Admin settings | Y | Y | assistant/shopper/plan | Settings | scattered | none | Low |

**Preservation:** No existing features were removed. Security/ops changes only.

---

## Scores (/100)

| Area | Score |
| ---- | ----- |
| Product Functionality | 92 |
| Code Quality | 84 |
| Security | 82 |
| Multi-Tenancy | 88 |
| Billing | 45 |
| Shopify Integration | 86 |
| AI Reliability | 80 |
| Database | 78 |
| Production Operations | 82 |
| UI/UX | 78 |
| App Store Readiness | 52 |

---

## VERIFIED (live)

- `https://bundleguard-24n6.onrender.com/readyz` → `ok`, `db:up`
- `/healthz` 200, `/privacy` 200
- Local `SHOPIFY_APP_URL` / TOML / `production.render.vars.env` aligned to `-24n6`
- `npm run test:critical` — 9/9 passed
- `npm run smoke:prod` — ran against live host
- Shopper Pro gate in proxy loader + action (402)
- Cross-shop Prisma lists shop-scoped

## CODE VERIFIED (needs Partner / merchant click)

- Billing charge creation (Distribution must be Public)
- Full OAuth install / reinstall on store
- Plan upgrade/downgrade/cancel in Shopify Admin
- Theme embed Shopper AI on storefront with Pro

## BLOCKERS

1. **Shopify Distribution ≠ Public** → Billing API: “owned by a Shop”
2. **App Store listing assets** (screenshots, privacy URL in Partner listing)
3. **Secret rotation** if keys were pasted in chat historically

## HIGH PRIORITY (post-config)

- Confirm Render Dashboard env matches `-24n6` (local file fixed)
- Redis-backed rate limit for multi-instance
- Job queue for inventory/order sync under load
- GDPR data_request merchant email ops process

## Fixes applied this pass (preserve behavior)

1. Shopper AI history **lead-scoped** (no cross-shopper PII in OpenAI context)
2. App proxy loader trusts **session.shop** only
3. Merchant AI **rate limit** (30/min)
4. `scopes_update` webhook **idempotency**
5. Structured error logs + **requestId** on public errors
6. URL drift fixed in examples/scripts/docs → `-24n6`
7. Alternate TOML dual-client_id warning strengthened

## EXTERNAL CONFIGURATION REQUIRED

| System | Action |
| ------ | ------ |
| Shopify Dev Dashboard | Choose distribution → **Public** |
| Shopify Partner listing | Privacy URL = `https://bundleguard-24n6.onrender.com/privacy` |
| Shopify Partner listing | 5 screenshots + accurate pricing copy |
| Render Dashboard | Confirm `SHOPIFY_APP_URL`, `SHOPIFY_BILLING_TEST=false`, Postgres |
| Secrets | Rotate Shopify secret / OpenAI / Render API if exposed |
| Store | Fresh reinstall after Public; approve Plan trial |

## FINAL DECISION

```text
GO WITH EXTERNAL CONFIGURATION
```

Code + host are production-capable for real merchants once Partner **Public** distribution unlocks Billing and listing assets are completed. Not a full **GO** until live Plan charge is approved on a development store.
