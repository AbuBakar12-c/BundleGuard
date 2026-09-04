# BundleGuard production hardening report — September 4, 2026

## Final status

**NOT YET PRODUCTION READY** (host + Partner URL deploy still required)

Code + Railway packaging are ready. Remaining: interactive `railway login`,
public HTTPS URL, `shopify app deploy`, live smoke.

Host path: **Railway** + managed Postgres (see `docs/railway-deploy.md`).
Vercel is out of scope (serverless rewrite). Fly remains an alternate if billed.

---

## 1. What was fixed (this pass)

### Shopify / Pro authorization
- Centralized entitlements: `app/services/entitlements.server.ts`
- App Proxy Shopper AI Pro-gated on **loader and action** (`apps.bundleguard.chat.tsx`)
- Subscription resolved via Admin GraphQL `activeSubscriptions` (backend only)
- External blocked-alert webhooks gated by Growth+ `blockedAlerts`

### OAuth / sessions
- Unchanged Shopify template OAuth (HMAC, state, Prisma session storage)
- Session model indexed by `shop`
- Uninstall + shop/redact purge sessions shop-scoped

### Webhooks / GDPR
- Compliance exports persisted (`ComplianceExport`) — not log-only
- Webhook idempotency (`WebhookDelivery` unique shop+topic+webhookId)
- Uninstall / orders / inventory / compliance claim delivery before work
- Tenant scope uses authenticated webhook `shop`, not payload alone
- Customer redact also deletes compliance exports for that email

### Multi-tenant
- Bundle delete alerts scoped by `{ shop, bundleId }`
- Lead updates still verify shop ownership before mutate

### Security / public APIs
- `http.server.ts` safe public errors (no stack traces to clients)
- Shop domain normalization
- Stricter production boot: blocks SQLite, example.com, tunnels, billing-test=true
- Privacy page reads `SUPPORT_EMAIL` / `PRIVACY_EMAIL` / `COMPANY_NAME` from env

### Deploy / Docker / Fly
- Multi-stage Dockerfile, non-root user, image HEALTHCHECK
- Fly check path → `/readyz` (DB ping)
- New `/readyz` route
- `.env.example` / `.env.production.example` names-only
- `shopify.app.toml` uses `REPLACE_WITH_PRODUCTION_HOST` (no fake domain)

### Tests
- `npm run test:critical` — plan gates, shop normalize, catalog quiz

---

## 2. Shopify fixes summary

| Area | Status |
|------|--------|
| OAuth | Relies on Shopify library; production URL must be set manually |
| API | October 2025; scopes unchanged |
| Webhooks | HMAC via `authenticate.webhook`; idempotent deliveries |
| GDPR | Export stored; redact/purge shop-scoped |
| App Proxy | HMAC via `authenticate.public.appProxy` + Pro entitlement |
| Billing | Fail-closed in prod; Pro enforced on proxy |
| Pro authorization | Centralized entitlements service |

---

## 3. Security fixes

- Shopper proxy Pro gate (402 without entitlement)
- Production env hard-fails on SQLite / placeholder URL / billing test mode
- Safe JSON errors for proxy
- Docker non-root + no baked `.env`
- Secrets templates scrubbed

---

## 4. Database fixes

- `ComplianceExport`, `WebhookDelivery` models
- `Session @@index([shop])`
- Local `prisma db push` applied (SQLite)

---

## 5. Deployment fixes

- Dockerfile multi-stage + HEALTHCHECK
- fly.toml readiness `/readyz`
- Docs/examples updated for real host placeholders

---

## 6. Validation (executed)

```
npx prisma db push          → OK (SQLite synced)
npx prisma generate         → OK
npm run test:critical       → 8/8 passed
npm run typecheck           → OK (exit 0)
```

---

## 7. Remaining manual steps (cannot be done in code)

1. Interactive `railway login` (CLI refuses non-interactive login)
2. `npm run railway:bootstrap` or dashboard: Postgres + deploy + generate domain
3. Set Railway Variables from `.env.production.example` / `production.railway.vars.env`
4. Put HTTPS URL in `production.inputs.env` → `npm run prod:inputs`
5. `npx shopify app deploy --config shopify.app.toml`
6. `npm run smoke:prod -- https://….up.railway.app`
7. **Rotate** Shopify API secret + OpenAI key if they were ever shared
8. Fresh install on a development store; confirm billing + Shopper Pro gate

---

## 8. Final status

**NOT YET PRODUCTION READY**

Blockers: Railway not linked (login required); no public HTTPS URL yet;
Partner `shopify app deploy` pending; live smoke pending.
Support/company defaults are in `production.inputs.env` (edit if wrong).
