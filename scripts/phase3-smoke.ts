/**
 * Phase 3 smoke: production env guards + compliance surface checks.
 * Run: npx tsx scripts/phase3-smoke.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { assertProductionEnv } from "../app/env.server";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`  ✓ ${message}`);
}

function read(path: string) {
  return readFileSync(resolve(path), "utf8");
}

async function main() {
  console.log("Phase 3 smoke tests\n");

  console.log("1) Production env guard (non-production should no-op)");
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  assertProductionEnv();
  assert(true, "assertProductionEnv no-ops outside production");

  console.log("2) Production env guard blocks example.com");
  process.env.NODE_ENV = "production";
  process.env.SHOPIFY_API_KEY = "k";
  process.env.SHOPIFY_API_SECRET = "s";
  process.env.SCOPES = "read_products";
  process.env.DATABASE_URL = "postgresql://local/test";
  process.env.SHOPIFY_APP_URL = "https://example.com";
  let blocked = false;
  try {
    assertProductionEnv();
  } catch {
    blocked = true;
  }
  assert(blocked, "blocks example.com app URL in production");

  process.env.SHOPIFY_APP_URL = "https://bundleguard.example-app.com";
  assertProductionEnv();
  assert(true, "allows real HTTPS host");
  process.env.NODE_ENV = prev;

  console.log("3) Compliance / deploy files present");
  assert(existsSync("app/routes/webhooks.compliance.tsx"), "GDPR route exists");
  assert(existsSync("app/routes/privacy.tsx"), "privacy policy route exists");
  assert(existsSync("app/routes/healthz.tsx"), "healthz route exists");
  assert(existsSync("docs/production-deploy.md"), "production deploy doc exists");
  assert(existsSync("docker-compose.yml"), "docker-compose exists");
  assert(!existsSync("app/routes/app.additional.tsx"), "template additional page removed");

  const toml = read("shopify.app.toml");
  assert(toml.includes("compliance_topics"), "TOML has compliance_topics");
  assert(toml.includes("write_app_proxy"), "TOML has write_app_proxy");
  const scopesLine = toml
    .split("\n")
    .find((line) => line.trim().startsWith("scopes ="));
  assert(Boolean(scopesLine), "TOML scopes line present");
  assert(
    !scopesLine!.includes("write_inventory"),
    "TOML scopes do not include write_inventory",
  );

  const dockerignore = read(".dockerignore");
  assert(dockerignore.includes(".env"), ".dockerignore excludes .env");

  const dockerfile = read("Dockerfile");
  assert(
    dockerfile.includes("SHOPIFY_BILLING_TEST=false"),
    "Dockerfile defaults billing enforce",
  );

  console.log("\nAll Phase 3 smoke tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
