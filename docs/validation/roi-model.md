# ROI Model — BundleGuard (Advanced Bundles App)

**Conservative inputs** per plan validation protocol.

## Assumptions

| Input | Pessimistic | Optimistic |
|-------|-------------|------------|
| Shopify stores (addressable) | 4,000,000 | 4,000,000 |
| ICP filter (% selling bundles) | 8% | 12% |
| Addressable merchants | 320,000 | 480,000 |
| Year-1 install rate | 0.5% | 2.0% |
| Installs | 1,600 | 9,600 |
| Trial → paid conversion | 10% | 25% |
| Paid customers | 160 | 2,400 |
| Blended ARPU | $35/mo | $42/mo |

## Year-1 MRR Projection

| Scenario | Paid customers | ARPU | MRR | ARR |
|----------|----------------|------|-----|-----|
| **Pessimistic** | 160 | $35 | **$5,600** | **$67,200** |
| **Base case** | 400 | $39 | **$15,600** | **$187,200** |
| **Optimistic** | 2,400 | $42 | **$100,800** | **$1,209,600** |

*Base case: 0.125% penetration, 15% conversion, $39 ARPU — realistic solo-dev year 1.*

## Unit Economics

| Metric | Value |
|--------|-------|
| Shopify revenue share | ~0% on first $1M lifetime (Partner tier dependent) |
| Est. hosting cost/customer | ~$0.50–2/mo |
| Support time budget | 30 min/customer/mo at scale |
| Target gross margin | >85% |
| CAC (organic App Store) | ~$0–50 (content + ASO) |
| LTV (24 mo, 5% churn) | ~$740 @ $39/mo |

## Break-Even Analysis

| Cost | Monthly |
|------|---------|
| Hosting (Vercel/Railway) | $20 |
| Domain + email | $15 |
| Dev tools | $30 |
| **Fixed burn** | **$65/mo** |

**Break-even:** 2 paid customers @ $39/mo → covers infra. Viable solo business at **40+ paid customers** ($1,560 MRR).

## Sensitivity — What kills the model?

| Risk | Impact | Mitigation |
|------|--------|------------|
| Shopify fixes Bundles app | High | Move faster; own reliability + multi-location niche |
| Fast Bundle adds inventory audit | Medium | Deep ops features + BFS badge |
| Low conversion on free trial | Medium | Freemium 3-bundle tier |
| Support overwhelm | Medium | Self-serve health dashboard |

## Decision

✅ **ROI clears bar** at base case ($15.6K MRR year 1). Proceed to MVP.
