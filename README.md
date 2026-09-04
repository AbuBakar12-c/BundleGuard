# BundleGuard — Smart Bundle Inventory

Shopify app that keeps product bundle inventory accurate: health dashboard, OOS policy audit, one-click resync, and theme app extension.

## Validation artifacts

- [`docs/validation/competitor-teardown.md`](docs/validation/competitor-teardown.md)
- [`docs/validation/review-mining.md`](docs/validation/review-mining.md)
- [`docs/validation/merchant-interviews.md`](docs/validation/merchant-interviews.md)
- [`docs/validation/roi-model.md`](docs/validation/roi-model.md)
- [`docs/app-store-listing.md`](docs/app-store-listing.md)

## Quick start

### Prerequisites

- Node.js 20.11+ (22.12+ recommended)
- Shopify Partner account
- Shopify CLI (`npm install -g @shopify/cli@latest`)

### Setup

```bash
cd e:\Shopify-App
npm install --no-engine-strict
npx prisma migrate dev --name bundleguard_init
npx prisma generate
```

### Link app & run dev server

```bash
shopify auth login
shopify app config link
shopify app dev
```

Press `p` to open the app in your dev store admin.

## Features (MVP spike)

| Feature | Route / file |
|---------|----------------|
| Bundle health dashboard | `/app` |
| Create bundle (GraphQL) | `/app/bundles/new` |
| Bundle detail + resync | `/app/bundles/:id` |
| OOS policy audit | `/app/audit` |
| Order/inventory webhooks | `webhooks.orders.create`, `webhooks.inventory.update` |
| Storefront badge | `extensions/bundleguard-display` |

## Unlisted beta launch

See [`docs/beta/unlisted-submission-checklist.md`](docs/beta/unlisted-submission-checklist.md).

## Pricing (planned)

- Starter $19/mo — 10 bundles
- Growth $39/mo — 50 bundles + OOS audit
- Pro $79/mo — unlimited + multi-location

Configure via Shopify App Pricing in Partner Dashboard on submission.
