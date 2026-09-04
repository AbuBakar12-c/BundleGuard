# Week 2: Review Mining — 50 Reviews Across Top 3 Incumbents

**Sources:** Shopify Community, App Store reviews (aggregated via GapQuery + community threads), competitor blog review roundups (BOGOS, FastBundle, StockLogic).

**Method:** Read in batches of 25; track specificity; sort by recency; extract "I wish..." phrases.

---

## Sample Distribution

| Source | 1-star | 3-star | Total analyzed |
|--------|--------|--------|----------------|
| Shopify Bundles (official) | 28 | 10 | 38 |
| Simple Bundles & Kits | 4 | 4 | 8 |
| Fast Bundle | 2 | 2 | 4 |

*Shopify Bundles dominates negative volume — primary disruption target.*

---

## Feature Spec Extracted from Reviews

### P0 — Ship in MVP (Week 3 spike)

| # | Complaint pattern | Frequency | MVP feature |
|---|-------------------|-----------|-------------|
| 1 | "Bundle shows out of stock but all items are in stock" | 19/50 | **Inventory resync engine** + health dashboard |
| 2 | "Continue selling when OOS" breaks bundle math | 11/50 | **Component policy audit** — flag + fix wizard |
| 3 | "Inventory doesn't update after component sells individually" | 9/50 | **Shared pool sync** on order webhooks |
| 4 | "Different warehouse shows wrong quantity" | 9/50 | **Per-location availability** calculation |
| 5 | "Had to delete and recreate bundle to fix" | 8/50 | **One-click bundle repair** / rebuild from components |

### P1 — Post-MVP

| Complaint | Feature |
|-----------|---------|
| "No volume discount on bundle" | Tiered bundle pricing (Buy 2 save 10%) |
| "Bundle not on invoice/packing slip" | Fulfillment document metafields |
| "Doesn't work on Facebook/Google channel" | Sales channel inventory push |
| "Renamed variant broke bundle" | Component link integrity checker |

### Ignore for product (support moat, not features)

- "Support never replied" — beat on response time (<4hr)
- "Setup is confusing" — fix with setup guide + empty states

---

## Verbatim Quote Bank (representative)

> "Bundle parent shows 0 inventory even though every component has 50+ units. Had to toggle inventory policy on each component to force a refresh."

> "We have 3 warehouses. Bundle says 100 available but Location B is empty — we oversold."

> "One component set to continue selling when out of stock and the whole bundle stayed buyable with zero toner left."

> "Wish the app would just tell me WHY the bundle is unavailable instead of showing zero."

> "No way to do 'buy the set save 15%' — only flat bundle price."

---

## Go/No-Go Check

| Validation test | Result |
|-----------------|--------|
| Reviews mention specific broken workflows (not just support)? | ✅ Yes — inventory/OOS/location |
| Category has 1,000+ cumulative reviews? | ✅ Yes — bundles category |
| Top incumbents below 4.5 on key player? | ✅ Shopify Bundles 2.70 |
| Feature gap mappable to 4-week MVP? | ✅ Yes — sync + OOS rules |

**Decision:** ✅ **Proceed to build spike**
