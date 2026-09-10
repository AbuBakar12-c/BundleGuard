/**
 * Product doctor — config + unit gates (no secrets printed).
 * Run: npx tsx scripts/product-doctor.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  effectiveFeatures,
  featuresForPlan,
  STARTER_PLAN,
  GROWTH_PLAN,
  PRO_PLAN,
} from "../app/plans";
import { shouldEnforceBilling } from "../app/billing.server";
import { hasFeature } from "../app/services/entitlements.server";
import { normalizeShopDomain } from "../app/services/http.server";

function parseEnv(path: string) {
  const map: Record<string, string> = {};
  if (!existsSync(path)) return map;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (/^\s*#/.test(line) || !line.includes("=")) continue;
    const i = line.indexOf("=");
    map[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return map;
}

function ok(msg: string) {
  console.log(`  OK  ${msg}`);
}
function bad(msg: string) {
  console.log(`  FAIL  ${msg}`);
}
function warn(msg: string) {
  console.log(`  WARN  ${msg}`);
}

async function main() {
  console.log("BundleGuard product doctor\n");
  let failures = 0;

  const env = parseEnv(resolve(".env"));
  const appUrl = env.SHOPIFY_APP_URL || "";
  const isPlaceholder =
    /example\.com|REPLACE_WITH|localhost|127\.0\.0\.1/i.test(appUrl);

  console.log("1) Local env");
  if (!env.SHOPIFY_API_KEY) {
    bad("SHOPIFY_API_KEY missing");
    failures++;
  } else ok("SHOPIFY_API_KEY present");
  if (!env.SHOPIFY_API_SECRET) {
    bad("SHOPIFY_API_SECRET missing");
    failures++;
  } else ok("SHOPIFY_API_SECRET present");
  if (appUrl === "") {
    ok(
      "SHOPIFY_APP_URL empty in .env — OK only if you start via npm run dev (CLI injects tunnel)",
    );
  } else if (isPlaceholder) {
    bad(`SHOPIFY_APP_URL is placeholder/bad host: ${appUrl}`);
    failures++;
  } else if (appUrl.startsWith("https://")) {
    ok("SHOPIFY_APP_URL set to real https host");
  } else {
    bad("SHOPIFY_APP_URL must be https or empty for local");
    failures++;
  }
  if (/example\.com/i.test(appUrl)) {
    bad("SHOPIFY_APP_URL is example.com — will show Example Domain");
    failures++;
  }
  if ((env.DATABASE_URL || "").startsWith("file:")) {
    ok("DATABASE_URL sqlite for local");
  } else warn("DATABASE_URL is not sqlite — fine if intentional");
  if (env.SHOPIFY_BILLING_TEST === "true") {
    ok("SHOPIFY_BILLING_TEST=true (local Pro unlock)");
  } else warn("SHOPIFY_BILLING_TEST not true — billing may enforce locally");
  if (env.SUPPORT_EMAIL) ok("SUPPORT_EMAIL set");
  else warn("SUPPORT_EMAIL missing (needed for /privacy + App Store)");
  if (env.OPENAI_API_KEY) ok("OPENAI_API_KEY present");
  else warn("OPENAI_API_KEY missing — AI uses fallbacks");

  console.log("\n2) Billing / entitlements");
  process.env.SHOPIFY_BILLING_TEST = env.SHOPIFY_BILLING_TEST || "true";
  process.env.NODE_ENV = "development";
  const enforced = shouldEnforceBilling();
  if (!enforced) ok("Billing not enforced in local doctor context");
  else {
    bad("Billing unexpectedly enforced");
    failures++;
  }
  const unlocked = effectiveFeatures(undefined, false);
  if (unlocked.shopperAi && unlocked.merchantAi) {
    ok("When billing not enforced, Pro features unlocked");
  } else {
    bad("effectiveFeatures unlock failed");
    failures++;
  }
  const starter = featuresForPlan(STARTER_PLAN);
  if (!starter.shopperAi && !starter.merchantAi) {
    ok("Starter correctly denies AI");
  } else {
    bad("Starter gating wrong");
    failures++;
  }
  const growth = featuresForPlan(GROWTH_PLAN);
  if (growth.merchantAi && !growth.shopperAi) {
    ok("Growth has merchant AI, not shopper AI");
  } else {
    bad("Growth gating wrong");
    failures++;
  }
  const pro = featuresForPlan(PRO_PLAN);
  if (pro.shopperAi) ok("Pro unlocks shopper AI");
  else {
    bad("Pro missing shopper AI");
    failures++;
  }
  const deniedCtx = {
    shop: "a.myshopify.com",
    planName: STARTER_PLAN,
    features: starter,
    billingEnforced: true,
    hasActivePayment: true,
  };
  if (!hasFeature(deniedCtx, "shopperAi")) ok("hasFeature denies Starter shopperAi");
  else {
    bad("hasFeature Starter gate failed");
    failures++;
  }

  console.log("\n3) Shop domain normalize");
  if (normalizeShopDomain("bundleguard-nkhkwmsy.myshopify.com")) {
    ok("normalizeShopDomain accepts store domain");
  } else {
    bad("normalizeShopDomain rejects valid store");
    failures++;
  }
  if (!normalizeShopDomain("not a shop")) ok("normalizeShopDomain rejects junk");
  else {
    bad("normalizeShopDomain accepted junk");
    failures++;
  }

  console.log("\n4) Production TOML");
  const toml = readFileSync(resolve("shopify.app.toml"), "utf8");
  if (toml.includes("REPLACE_WITH_PRODUCTION_HOST")) {
    warn(
      "shopify.app.toml still placeholder — expected until Render/Railway URL exists",
    );
  } else if (toml.includes("example.com")) {
    bad("shopify.app.toml still has example.com");
    failures++;
  } else ok("shopify.app.toml has real application_url");

  console.log(
    failures === 0
      ? "\nDoctor result: PASS (local product config OK)"
      : `\nDoctor result: FAIL (${failures} issue(s))`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
