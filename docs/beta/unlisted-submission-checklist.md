# Unlisted App Submission Checklist

Use this checklist to submit BundleGuard as an **unlisted public app** for beta testing.

## Pre-submission

- [ ] Run `shopify auth login` and link Partner app (`shopify app config link`)
- [ ] Set `client_id` in `shopify.app.toml` after linking
- [ ] Run `npx prisma migrate deploy` on production database
- [ ] Deploy app: `shopify app deploy`
- [ ] Verify webhooks registered: orders/create, inventory_levels/update
- [ ] Test install on development store end-to-end

## Partner Dashboard — App Store listing

Copy content from [`../app-store-listing.md`](../app-store-listing.md):

- **App name:** BundleGuard — Smart Bundle Inventory
- **Category:** Inventory, Product bundles
- **Pricing:** $19 / $39 / $79 with 14-day trial (Shopify App Pricing)

## Distribution settings

1. Partner Dashboard → Apps → BundleGuard → Distribution
2. Set visibility to **Unlisted**
3. Copy install link for beta merchants
4. Do **not** enable public search until 3+ successful beta installs

## Beta merchant onboarding (target: 3)

| # | Profile | Source | Status |
|---|---------|--------|--------|
| 1 | DTC Skincare ~$180K/yr | r/shopify outreach | Pending |
| 2 | Supplement store ~$420K/yr | Interview M2 | Pending |
| 3 | Multi-location home goods | Interview M3 | Pending |

### Onboarding script (15 min screen-share)

1. Send unlisted install link
2. Merchant installs → lands on Dashboard
3. Walk through: Create bundle → Run OOS audit → Resync
4. Enable theme block: Online Store → Themes → Customize → Add "Bundle availability" block
5. Note friction points in [`beta-feedback-log.md`](./beta-feedback-log.md)

## Onboarding frictions fixed in MVP

| Friction | Fix implemented |
|----------|-----------------|
| Empty dashboard confusion | Setup guide empty state + CTA |
| No explanation of blocked status | `blockReason` shown on dashboard and detail |
| Manual GID entry awkward | Documented JSON component format; resource picker in Phase 2 |
| No bulk resync | "Resync all" on dashboard + webhook auto-sync |

## Go-public criteria

- [ ] 3 merchants install without hand-holding
- [ ] 1 unprompted referral or positive beta feedback
- [ ] App rating 4.5+ from beta cohort
- [ ] Support response SLA under 4 hours documented

## Compliance (before public launch)

- [ ] Add GDPR webhooks (customers/data_request, customers/redact, shop/redact)
- [ ] Privacy policy URL on listing
- [ ] App Store requirements review pass
