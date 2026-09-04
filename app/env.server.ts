/**
 * Production environment guards. Import early from shopify.server / entry.
 */

export function assertProductionEnv() {
  if (process.env.NODE_ENV !== "production") return;

  const missing: string[] = [];
  for (const key of [
    "SHOPIFY_API_KEY",
    "SHOPIFY_API_SECRET",
    "SHOPIFY_APP_URL",
    "DATABASE_URL",
    "SCOPES",
  ] as const) {
    if (!process.env[key]?.trim()) missing.push(key);
  }

  if (missing.length > 0) {
    throw new Error(
      `Production boot blocked. Missing required env: ${missing.join(", ")}`,
    );
  }

  const appUrl = process.env.SHOPIFY_APP_URL!;
  if (
    appUrl.includes("example.com") ||
    appUrl.includes("localhost") ||
    appUrl.includes("127.0.0.1") ||
    appUrl.includes("trycloudflare.com") ||
    appUrl.includes("REPLACE_WITH")
  ) {
    throw new Error(
      "Production boot blocked. SHOPIFY_APP_URL must be your stable HTTPS app host (not example.com / tunnel / placeholder).",
    );
  }

  if (!appUrl.startsWith("https://")) {
    throw new Error(
      "Production boot blocked. SHOPIFY_APP_URL must use https://",
    );
  }

  const db = process.env.DATABASE_URL!;
  if (db.startsWith("file:")) {
    throw new Error(
      "Production boot blocked. DATABASE_URL must be PostgreSQL (not SQLite file:). Run npm run db:postgres and set a Postgres URL.",
    );
  }

  if (process.env.SHOPIFY_BILLING_TEST === "true") {
    throw new Error(
      "Production boot blocked. SHOPIFY_BILLING_TEST must be false (or unset) so Shopify Billing is enforced.",
    );
  }

  if (!process.env.SUPPORT_EMAIL?.trim() && !process.env.PRIVACY_EMAIL?.trim()) {
    console.warn(
      "[BundleGuard] WARNING: SUPPORT_EMAIL / PRIVACY_EMAIL not set — required before App Store submission.",
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    console.warn(
      "[BundleGuard] OPENAI_API_KEY missing — AI assistants will use deterministic fallbacks only.",
    );
  }
}

export function isProduction() {
  return process.env.NODE_ENV === "production";
}
