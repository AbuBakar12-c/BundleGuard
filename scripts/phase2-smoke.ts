/**
 * Phase 2 smoke tests: plan features, billing fail-closed, rate limit.
 * Run: npx tsx scripts/phase2-smoke.ts
 */
import {
  STARTER_PLAN,
  GROWTH_PLAN,
  PRO_PLAN,
  effectiveFeatures,
  featuresForPlan,
  bundleLimitForPlan,
} from "../app/plans";
import { shouldEnforceBilling, isTestCharge } from "../app/billing.server";
import { rateLimit } from "../app/services/rate-limit.server";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`  ✓ ${message}`);
}

async function main() {
  console.log("Phase 2 smoke tests\n");

  console.log("1) Plan feature matrix");
  assert(!featuresForPlan(STARTER_PLAN).oosAudit, "Starter has no OOS audit");
  assert(featuresForPlan(GROWTH_PLAN).oosAudit, "Growth has OOS audit");
  assert(!featuresForPlan(GROWTH_PLAN).locationAudit, "Growth has no location audit");
  assert(featuresForPlan(PRO_PLAN).locationAudit, "Pro has location audit");
  assert(featuresForPlan(PRO_PLAN).shopperAi, "Pro has Shopper AI");
  assert(bundleLimitForPlan(STARTER_PLAN) === 10, "Starter limit 10");
  assert(bundleLimitForPlan(PRO_PLAN) === Number.POSITIVE_INFINITY, "Pro unlimited");

  console.log("2) Dev unlock vs enforced");
  assert(
    effectiveFeatures(STARTER_PLAN, false).shopperAi === true,
    "unenforced billing unlocks Pro features",
  );
  assert(
    effectiveFeatures(STARTER_PLAN, true).shopperAi === false,
    "enforced Starter blocks Shopper AI",
  );

  console.log("3) Billing env helpers (current process)");
  console.log(
    `  · shouldEnforceBilling=${shouldEnforceBilling()} isTestCharge=${isTestCharge()} NODE_ENV=${process.env.NODE_ENV} BILLING_TEST=${process.env.SHOPIFY_BILLING_TEST}`,
  );
  assert(typeof shouldEnforceBilling() === "boolean", "shouldEnforceBilling returns boolean");

  console.log("4) Rate limiter");
  const key = `smoke:${Date.now()}`;
  for (let i = 0; i < 3; i++) {
    const r = rateLimit({ key, limit: 3, windowMs: 60_000 });
    assert(r.ok, `request ${i + 1} allowed`);
  }
  const blocked = rateLimit({ key, limit: 3, windowMs: 60_000 });
  assert(!blocked.ok, "4th request blocked");

  console.log("\nAll Phase 2 smoke tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
