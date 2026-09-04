/**
 * Critical production-path unit checks (no network).
 * Run: npx tsx scripts/critical-path-tests.ts
 */

import assert from "node:assert/strict";
import {
  effectiveFeatures,
  featuresForPlan,
  PRO_PLAN,
  STARTER_PLAN,
  GROWTH_PLAN,
} from "../app/plans";
import { normalizeShopDomain } from "../app/services/http.server";
import { hasFeature } from "../app/services/entitlements.server";
import {
  buildCategoryOptionsFromCatalog,
  buildBudgetOptionsFromProducts,
  filterCatalogByCategory,
} from "../app/services/recommend-quiz.server";
import type { StoreCatalog } from "../app/services/catalog.server";

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

check("Starter has no shopperAi / oosAudit", () => {
  const f = featuresForPlan(STARTER_PLAN);
  assert.equal(f.shopperAi, false);
  assert.equal(f.oosAudit, false);
  assert.equal(f.blockedAlerts, false);
});

check("Growth has merchantAi + blockedAlerts, not shopperAi", () => {
  const f = featuresForPlan(GROWTH_PLAN);
  assert.equal(f.merchantAi, true);
  assert.equal(f.blockedAlerts, true);
  assert.equal(f.shopperAi, false);
  assert.equal(f.locationAudit, false);
});

check("Pro unlocks shopperAi + locationAudit", () => {
  const f = featuresForPlan(PRO_PLAN);
  assert.equal(f.shopperAi, true);
  assert.equal(f.locationAudit, true);
});

check("effectiveFeatures unlocks Pro when billing not enforced", () => {
  const f = effectiveFeatures(STARTER_PLAN, false);
  assert.equal(f.shopperAi, true);
});

check("effectiveFeatures respects Starter when billing enforced", () => {
  const f = effectiveFeatures(STARTER_PLAN, true);
  assert.equal(f.shopperAi, false);
});

check("hasFeature gates shopperAi", () => {
  const denied = {
    shop: "a.myshopify.com",
    planName: STARTER_PLAN,
    features: featuresForPlan(STARTER_PLAN),
    billingEnforced: true,
    hasActivePayment: true,
  };
  assert.equal(hasFeature(denied, "shopperAi"), false);
  const allowed = {
    ...denied,
    planName: PRO_PLAN,
    features: featuresForPlan(PRO_PLAN),
  };
  assert.equal(hasFeature(allowed, "shopperAi"), true);
});

check("normalizeShopDomain rejects junk", () => {
  assert.equal(normalizeShopDomain(null), null);
  assert.equal(normalizeShopDomain("not a shop"), null);
  assert.equal(
    normalizeShopDomain("https://Acme.myshopify.com"),
    "acme.myshopify.com",
  );
});

check("recommend quiz options come only from catalog categories", () => {
  const catalog: StoreCatalog = {
    shop: "demo.myshopify.com",
    shopName: "Demo",
    fetchedAt: new Date().toISOString(),
    productCount: 2,
    products: [
      {
        id: "1",
        title: "Board",
        handle: "board",
        description: "",
        vendor: "V",
        productType: "Snowboard",
        tags: [],
        status: "ACTIVE",
        imageUrl: null,
        url: "https://demo.myshopify.com/products/board",
        minPrice: "100.00",
        maxPrice: "100.00",
        available: true,
        totalInventory: 5,
        variants: [],
        collections: ["Winter"],
      },
      {
        id: "2",
        title: "Wax",
        handle: "wax",
        description: "",
        vendor: "V",
        productType: "Accessories",
        tags: [],
        status: "ACTIVE",
        imageUrl: null,
        url: "https://demo.myshopify.com/products/wax",
        minPrice: "12.00",
        maxPrice: "12.00",
        available: true,
        totalInventory: 20,
        variants: [],
        collections: ["Winter"],
      },
    ],
  };

  const cats = buildCategoryOptionsFromCatalog(catalog);
  const labels = cats.map((c) => c.value);
  assert.ok(labels.includes("Winter") || labels.includes("Snowboard"));
  assert.ok(!labels.some((l) => /phone|electronics|clothes/i.test(l)));

  const winter = filterCatalogByCategory(catalog, "Winter");
  assert.equal(winter.length, 2);
  const budgets = buildBudgetOptionsFromProducts(winter);
  assert.ok(budgets.length >= 1);
  assert.ok(budgets.every((b) => !/electronics/i.test(b.label)));
});

console.log(`\n${passed} critical-path checks passed`);
