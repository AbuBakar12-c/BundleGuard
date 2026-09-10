import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { assertProductionEnv } from "./env.server";
import {
  billingConfig,
  STARTER_PLAN,
  GROWTH_PLAN,
  PRO_PLAN,
} from "./billing.server";

export {
  STARTER_PLAN,
  GROWTH_PLAN,
  PRO_PLAN,
  BILLING_PLANS,
  isTestCharge,
} from "./billing.server";

assertProductionEnv();

const apiSecretKey = process.env.SHOPIFY_API_SECRET;
if (!apiSecretKey) {
  throw new Error(
    "SHOPIFY_API_SECRET is required. Copy .env.example to .env and set Partner credentials.",
  );
}

const appUrl = (process.env.SHOPIFY_APP_URL || "").trim();
if (!appUrl) {
  // Shopify library hard-fails on empty appUrl. Locally the tunnel is injected by
  // `shopify app dev` / `npm run dev` — never put example.com back in .env.
  throw new Error(
    "SHOPIFY_APP_URL is empty. For local development run `npm run dev` (Shopify CLI sets the Cloudflare tunnel URL). For production set SHOPIFY_APP_URL to your real https:// host (Render/Railway) — never example.com.",
  );
}
if (/example\.com/i.test(appUrl)) {
  throw new Error(
    "SHOPIFY_APP_URL must not be example.com (causes Example Domain). Clear it for `npm run dev`, or set your real production HTTPS URL.",
  );
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey,
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl,
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: {
    [STARTER_PLAN]: billingConfig[STARTER_PLAN],
    [GROWTH_PLAN]: billingConfig[GROWTH_PLAN],
    [PRO_PLAN]: billingConfig[PRO_PLAN],
  },
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
