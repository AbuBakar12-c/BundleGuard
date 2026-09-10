# BundleGuard — production / App Store readiness (updated Sep 10, 2026)

## Verdict

| Area | Status |
|------|--------|
| **Code / MVP** | ~95% — hardened for production |
| **Local product** | Ready (`npm run dev`) |
| **Production host** | **Blocked** — needs Render (or Railway) card + HTTPS URL |
| **App Store submit** | **Not ready** until host + Partner deploy + listing assets |

The Sep 4 “4 critical risks” are largely **fixed in code**. What remains is **ops**: live HTTPS + `shopify app deploy`.

---

## Sep 4 critical risks — current status

| # | Then | Now |
|---|------|-----|
| 1 | `example.com` URLs | **Fixed locally** (`.env` clear; CLI tunnel). Canonical TOML uses `REPLACE_WITH_PRODUCTION_HOST` (safe placeholder). Alternate config no longer uses `example.com`. |
| 2 | No Fly deploy | **Superseded** by Render Blueprint (`render.yaml`) + Railway/Fly still optional. Deploy blocked only by host billing. |
| 3 | SQLite default | **Correct for local**. Production Docker/`render.yaml` → Postgres. Boot fails if prod uses `file:`. |
| 4 | Shopper proxy not Pro-gated | **Fixed** — loader + action use `resolveEntitlementsFromAdmin` / `assertFeatureOrThrow` (402). |
| — | Partner billing ownership | Confirmed in `production.inputs.env` (`PARTNER_OWNED_APP=true`). Live charges need Partner org + `SHOPIFY_BILLING_TEST=false` on host. |

---

## Already production-grade in repo

- Entitlements service + plan gates (Starter / Growth / Pro)
- GDPR compliance webhooks + exports + uninstall purge
- Webhook idempotency, tenant scoping
- `/healthz`, `/readyz`, `/privacy` (SUPPORT_EMAIL / COMPANY_NAME)
- Docker multi-stage, non-root, Postgres switch in image
- `render.yaml`, Railway/Fly docs, `npm run doctor`, `test:critical`, `smoke:prod`
- Production env hard-fail (SQLite / placeholder / billing-test)

---

## What you must do to finish “production ready”

1. **Add a card** on [Render Billing](https://dashboard.render.com/billing) (or Railway).
2. Deploy Blueprint from https://github.com/AbuBakar12-c/BundleGuard (`render.yaml`).
3. Set secrets from `production.render.vars.env` / `.env.production.example`.
4. Copy `https://….onrender.com` →  
   `powershell -ExecutionPolicy Bypass -File .\scripts\set-production-url.ps1 -Url https://….onrender.com`
5. `npx shopify app deploy --config shopify.app.toml`
6. `npm run smoke:prod -- https://….onrender.com`
7. Rotate API secrets if they were ever shared; fresh store install smoke test.
8. App Store screenshots + privacy URL pointing at `https://YOUR_HOST/privacy`

Until step 1–6: **code-ready, not App Store–ready.**

---

## Commands

```powershell
npm run doctor          # local config
npm run test:critical   # plan gates
npm run deploy:check    # packaging
npm run smoke:prod -- https://YOUR_HOST   # after deploy
```
