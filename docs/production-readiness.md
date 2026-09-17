# BundleGuard — production / App Store readiness (updated Sep 10, 2026)

## Verdict (updated Sep 11, 2026)

| Area | Status |
|------|--------|
| **Code / MVP** | ~92% — production-hardened |
| **Production host** | **Live** — `https://bundleguard-24n6.onrender.com` (`/readyz` OK) |
| **Billing / Plan** | **Blocked** until Dev Dashboard **Distribution = Public** |
| **App Store submit** | **Not ready** until Public + screenshots + listing privacy URL |

Sep 4’s four code risks are fixed. Remaining blockers are **Partner ops**, not missing features.

---

## Sep 4 critical risks — current status

| # | Then | Now |
|---|------|-----|
| 1 | `example.com` URLs | **Fixed** — `shopify.app.toml` → Render `-24n6` host + redirects |
| 2 | No Fly deploy | **Fixed** — Render Docker service live (Fly optional) |
| 3 | SQLite default | **Fixed for prod** — Docker switches Postgres; boot rejects `file:` |
| 4 | Shopper proxy not Pro-gated | **Fixed** — loader + action 402 without Pro |
| — | Partner billing ownership | **OPEN** — must Choose distribution → **Public** before Billing API charges |

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
