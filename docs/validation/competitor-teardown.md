# Week 1: Competitor Teardown — Advanced Product Bundles

**Category locked:** Advanced Product Bundles (Shopify Bundles replacement)  
**Date:** August 2026  
**Decision gate:** ✅ Pain and MVP are one sentence each (see `positioning.md`)

---

## Top 5 Competitors (by App Store presence / reviews)

| Rank | App | Rating | Reviews | Price | Target merchant |
|------|-----|--------|---------|-------|-----------------|
| 1 | **Shopify Bundles** (first-party) | **2.70★** | 553+ | Free | All Shopify merchants |
| 2 | **Simple Bundles & Kits** | 4.7★ | 500+ | $29–$99/mo | Ops-heavy, 3PL, multi-location |
| 3 | **Fast Bundle** | 4.8★ | 1,000+ | Free–$49/mo | Discount-focused bundles |
| 4 | **Bundler - Product Bundles** | 4.6★ | 400+ | $19–$49/mo | SMB, simple fixed bundles |
| 5 | **Bundles.app** | 4.9★ | 308 | $19/mo | Inventory sync, kits |

**Ecosystem baseline:** 4.45★ avg | ~92 reviews/app

---

## Feature Comparison Matrix

| Capability | Shopify Bundles | Simple Bundles | Fast Bundle | Bundler | **Our wedge** |
|------------|-----------------|----------------|-------------|---------|---------------|
| Fixed bundles | ✅ | ✅ | ✅ | ✅ | ✅ |
| Real-time inventory sync | ⚠️ Buggy | ✅ | ✅ | ⚠️ | ✅ **Reliable + manual resync** |
| OOS when component OOS | ⚠️ Broken edge cases | ✅ | ✅ | ⚠️ | ✅ **Smart OOS rules** |
| Per-location inventory | ❌ | ✅ | ❌ | ❌ | ✅ **MVP: location-aware calc** |
| Tiered bundle discounts | ❌ | ⚠️ Limited | ✅ | ⚠️ | ✅ **Volume tiers** |
| Continue-selling audit | ❌ | ❌ | ❌ | ❌ | ✅ **Component policy checker** |
| Mix-and-match / BYOB | ❌ | ✅ | ✅ | ❌ | Phase 2 |
| Sales channel sync (FB/Google) | ❌ | ⚠️ | ✅ | ⚠️ | Phase 2 |
| Invoice/packing slip bundle detail | ❌ | ✅ | ⚠️ | ⚠️ | Phase 2 |

---

## Competitive Intensity Assessment

**Top-3 rating spread:** 2.70 / 4.7 / 4.8 — **fragmented quality** (not a closed category).

**Review concentration:** Shopify Bundles gets installs because it's default/free, not because it's good. Third-party leaders serve discount/UX niches, not **inventory reliability**.

**Verdict:** ✅ **Open category.** Beat Shopify on reliability; beat discount apps on inventory ops.

---

## One-Star Theme Summary (from 50-review mining)

See [`review-mining.md`](./review-mining.md) for full analysis. Top 5 repeated complaints:

1. Bundle shows **0 inventory** despite components in stock (38% of negative reviews)
2. **"Continue selling when OOS"** on components breaks availability math (22%)
3. **Multi-location** stock mismatch — aggregate vs per-warehouse (18%)
4. No **tiered/volume pricing** on bundles (12%)
5. Bundle breaks after **variant rename** or component edit (10%)

---

## Pricing Benchmark

| Tier | Market range | Our target |
|------|--------------|------------|
| Free | Shopify Bundles, Fast Bundle free tier | 14-day trial only |
| Starter | $9–$19/mo | **$19/mo** — up to 10 bundles |
| Growth | $29–$49/mo | **$39/mo** — up to 50 bundles + OOS rules |
| Pro | $49–$99/mo | **$79/mo** — unlimited + multi-location |

**Wedge:** Premium reliability at mid-market price (not cheapest, not enterprise).
