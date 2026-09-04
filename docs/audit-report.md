# BundleGuard — Work Audit Report

**Date:** August 22, 2026  
**Project:** BundleGuard (Shopify App)  
**Purpose:** Record what was built, what went wrong, and what must be fixed before production / App Store readiness.

---

## 1. Executive summary

BundleGuard started as a **bundle inventory health app** and later expanded into **merchant AI** + **storefront shopper AI** (Zipchat-inspired). Core inventory features are solid for an MVP. AI and deployment configuration still have important gaps that caused wrong answers and install/dev failures.

**Overall status:** Strong MVP foundation · AI accuracy improved but not “100% guaranteed” · **Not production-ready** until App URL, hosting, billing ownership, and catalog edge cases are fixed.

---

## 2. Work completed (what we built)

### A. Core BundleGuard product
| Feature | Status | Location |
|---|---|---|
| Bundle health dashboard | Done | `app/routes/app._index.tsx` |
| Create / detail / resync bundles | Done | `app/routes/app.bundles.*` |
| OOS policy audit | Done | `app/routes/app.audit.tsx` |
| Multi-location inventory audit | Done | `app/services/location-audit.server.ts`, `app/routes/app.locations.tsx` |
| Blocked inventory alerts | Done | `app/services/alerts.server.ts` |
| Shopify Billing (Starter/Growth/Pro) | Done (dev-bypass) | `app/billing.server.ts`, `app/plans.ts`, `app/routes/app.pricing.tsx` |
| Theme extension (bundle availability badge) | Done | `extensions/bundleguard-display` |

### B. Merchant Assistant (Admin AI)
| Feature | Status | Location |
|---|---|---|
| Chat UI | Done | `app/routes/app.chat.tsx` |
| OpenAI answers from bundle/alert data | Done | `app/services/chat.server.ts` |
| Settings / Analytics / Conversations | Done | `app/routes/app.assistant.*` |
| Intent-aware prompts + fallbacks | Done | `app/services/assistant-prompts.server.ts` |

### C. Shopper Assistant (Storefront AI)
| Feature | Status | Location |
|---|---|---|
| Floating chat widget (Zipchat-style) | Done | `extensions/.../shopper-assistant.liquid` |
| App Proxy chat API | Done | `app/routes/apps.bundleguard.chat.tsx` |
| Product recommendations + image upload | Done | buyer assistant + widget |
| Full catalog pagination loader | Done | `app/services/catalog.server.ts` |
| Accuracy-first prompts | Done | `app/services/buyer-assistant.server.ts` |
| Merchant Shopper AI control page | Done | `app/routes/app.shopper.tsx` |

### D. Dev / platform fixes along the way
- React Router `routeDiscovery: initial` (tunnel `/__manifest` failures)
- Billing redirect preserving query params
- Billing enforcement bypass when `SHOPIFY_BILLING_TEST=true`
- Prisma models: alerts, chat messages, buyer messages, shopper settings
- App proxy config (`[app_proxy]`)

---

## 3. Mistakes & issues found (root causes)

### Critical (blocks production)

| # | Mistake / Issue | Impact | Why it happened |
|---|---|---|---|
| 1 | **`application_url = https://example.com`** still in TOML / Versions | New installs show “Example Domain” page | Template placeholder never replaced with real hosted URL |
| 2 | **No stable production host** | Tunnel URLs expire; multi-store installs break | Dev-only Cloudflare tunnel used as if it were production |
| 3 | **App owned by Shop vs Partner** billing error | Cannot create real Shopify charges | Dev app not fully Partner-owned for Billing API |
| 4 | **Two app configs / client IDs** (`shopify.app.toml` vs `shopify.app.bundleguard.toml`) | Confusion, wrong store, wrong URLs | Multiple config files without clear “source of truth” |

### High (caused wrong AI answers)

| # | Mistake / Issue | Impact | Why it happened |
|---|---|---|---|
| 5 | Early shopper AI used **tiny product search**, not full catalog | AI said “I don’t know your products” | Over-aggressive keyword stripping + truncated GraphQL search |
| 6 | AI allowed to answer with **empty catalog context** | Hallucinated “no products / don’t know” | Prompt + retrieval pipeline too weak initially |
| 7 | Relied on OpenAI without strong **deterministic fallback** early on | Wrong tone / empty answers when API/key failed | Missing production fallback path at first |
| 8 | Claimed “Zipchat-level” without matching data depth | User expectation gap | UI polished before catalog accuracy was fixed |

### Medium (dev / UX friction)

| # | Mistake / Issue | Impact | Fix status |
|---|---|---|---|
| 9 | Cloudflare tunnel WebSocket / 524 errors | Blank app, failed preview | Env issue (restart/reset) — not fully preventable in free tunnels |
| 10 | Store password / wrong org / missing dev store | CLI loops, “could not find store” | Process/docs issue |
| 11 | Chat launcher didn’t toggle close at first | UX bug | Fixed |
| 12 | Empty flash on chat open | Looked broken | Fixed |
| 13 | Emoji icons then replaced | Unprofessional look | Fixed with SVG icons |
| 14 | Scope `write_app_proxy` missing in one config | Proxy/chat may fail until reinstall | Partially fixed in bundleguard.toml |

### Product / positioning risk

| # | Mistake / Issue | Impact |
|---|---|---|
| 15 | **Scope creep:** bundle inventory app + full shopper chatbot | App Store reviewers may see mixed purpose; support/cost complexity rises |
| 16 | Listing docs still describe inventory-only MVP | Marketing vs built product mismatch |
| 17 | SQLite + in-memory catalog cache | Fine for local; not enough for multi-instance production |

---

## 4. What is working well

- Clear core value: bundle health, OOS audit, multi-location gaps, resync
- Billing plan structure defined (even if charges need Partner ownership)
- Merchant and shopper assistants separated correctly
- Full catalog pagination is the right architecture for accurate shopper answers
- Polaris web-component UI fits embedded Shopify Admin
- Typecheck passing after recent AI/catalog work

---

## 5. Remaining gaps (not done yet)

1. **Production App URL + deploy** (Fly/Render/Railway/Vercel-compatible Node host)
2. **Remove `example.com`** from all versions and redirect URLs
3. **Partner Dashboard billing ownership** verified
4. **Email/Slack merchant alerts** (requested earlier, deferred)
5. **Demand forecasting / restock planner** (requested, out of MVP)
6. **Storefront Storefront API** path (optional; currently Admin GraphQL via app proxy)
7. **Persistent catalog DB** instead of 2-minute memory cache
8. **Automated tests** for catalog matching + chat accuracy
9. **App Store compliance pass** (privacy, GDPR webhooks completeness, listing sync)
10. **Phase 2 shopper:** order tracking, FAQs, conversion analytics

---

## 6. Honest accuracy statement (AI)

| Claim | Reality |
|---|---|
| “100% accurate every time” | **Not guaranteed** for any LLM app |
| What we can guarantee | Answers use **live Active catalog data**; no invented products when catalog loads |
| Failure modes left | Draft/archived products excluded; >250 products truncated; OpenAI outages fall back to deterministic text; image matching depends on vision keywords |

---

## 7. Recommended next actions (priority)

1. **Deploy app** → set real `application_url` + redirect URLs → redeploy version  
2. Confirm **Shopper AI catalog count > 0** on `/app/shopper`  
3. Keep **`OPENAI_API_KEY`** set in production secrets  
4. Decide product positioning:  
   - BundleGuard = inventory core + merchant AI, **or**  
   - BundleGuard + Shopper AI as explicit premium module  
5. Add automated smoke tests for chat + catalog  
6. Run Shopify App Store review checklist before submission  

---

## 8. Verdict

| Area | Grade | Notes |
|---|---|---|
| Bundle inventory MVP | **B+** | Solid core features |
| Billing | **C** | Code exists; Partner/charge readiness incomplete |
| Merchant AI | **B** | Good for ops Q&A |
| Shopper AI | **B- → B** after catalog fix | Much better; needs production hardening |
| DevOps / App URL | **D** | `example.com` + tunnel-only is the biggest blocker |
| App Store readiness | **Not ready** | Hosting, listing alignment, compliance still open |

**Bottom line:** A lot of valuable product work is done. The main mistakes were **using placeholder App URLs**, **building shopper AI before full catalog retrieval**, and **expanding scope faster than production infrastructure**. Fix hosting + URL first, then harden AI with tests.

---

*Generated as an internal project audit for BundleGuard development.*
