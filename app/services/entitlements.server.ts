/**
 * Centralized plan entitlements — never trust the frontend for Pro/Growth gates.
 * Admin routes: use Shopify billing helpers.
 * App Proxy / offline: resolve via Admin GraphQL activeSubscriptions.
 */

import type { PlanFeatures } from "../plans";
import {
  BILLING_PLANS,
  effectiveFeatures,
  PRO_PLAN,
  type BillingPlanName,
} from "../plans";
import { isTestCharge, shouldEnforceBilling } from "../billing.server";

export type EntitlementContext = {
  shop: string;
  planName: string | null;
  features: PlanFeatures;
  billingEnforced: boolean;
  hasActivePayment: boolean;
};

type BillingCheck = {
  check: (options: {
    plans: BillingPlanName[];
    isTest?: boolean;
  }) => Promise<{
    hasActivePayment: boolean;
    appSubscriptions: Array<{ name: string; id: string }>;
  }>;
};

type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export async function resolveEntitlementsFromBilling(
  shop: string,
  billing: BillingCheck,
): Promise<EntitlementContext> {
  const billingEnforced = shouldEnforceBilling();
  const checked = await billing.check({
    plans: [...BILLING_PLANS],
    isTest: isTestCharge(),
  });
  const planName = checked.appSubscriptions[0]?.name ?? null;

  return {
    shop,
    planName,
    features: effectiveFeatures(planName ?? undefined, billingEnforced),
    billingEnforced,
    hasActivePayment: checked.hasActivePayment,
  };
}

/**
 * Resolve entitlements for App Proxy / background jobs using the shop's
 * offline Admin API session (HMAC already verified by authenticate.public.appProxy).
 */
export async function resolveEntitlementsFromAdmin(
  shop: string,
  admin: AdminGraphql,
): Promise<EntitlementContext> {
  const billingEnforced = shouldEnforceBilling();

  if (!billingEnforced) {
    return {
      shop,
      planName: PRO_PLAN,
      features: effectiveFeatures(PRO_PLAN, false),
      billingEnforced: false,
      hasActivePayment: true,
    };
  }

  try {
    const response = await admin.graphql(
      `#graphql
        query BundleGuardActiveSubscriptions {
          currentAppInstallation {
            activeSubscriptions {
              name
              status
            }
          }
        }`,
    );

    if (!response.ok) {
      console.error(
        `[entitlements] subscription query HTTP ${response.status} for ${shop}`,
      );
      return denyAll(shop, billingEnforced);
    }

    const json = (await response.json()) as {
      data?: {
        currentAppInstallation?: {
          activeSubscriptions?: Array<{ name: string; status: string }>;
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (json.errors?.length) {
      console.error(
        `[entitlements] GraphQL errors for ${shop}`,
        json.errors.map((e) => e.message).join("; "),
      );
      return denyAll(shop, billingEnforced);
    }

    const active = (
      json.data?.currentAppInstallation?.activeSubscriptions ?? []
    ).filter((s) => s.status === "ACTIVE" || s.status === "active");

    const planName =
      active.find((s) => BILLING_PLANS.includes(s.name as BillingPlanName))
        ?.name ??
      active[0]?.name ??
      null;

    return {
      shop,
      planName,
      features: effectiveFeatures(planName ?? undefined, billingEnforced),
      billingEnforced,
      hasActivePayment: active.length > 0,
    };
  } catch (error) {
    console.error(`[entitlements] resolve failed for ${shop}`, error);
    return denyAll(shop, billingEnforced);
  }
}

function denyAll(shop: string, billingEnforced: boolean): EntitlementContext {
  return {
    shop,
    planName: null,
    features: effectiveFeatures(undefined, billingEnforced),
    billingEnforced,
    hasActivePayment: false,
  };
}

/** Throw a safe JSON Response when a plan feature is missing. */
export function assertFeatureOrThrow(
  entitlements: EntitlementContext,
  feature: keyof PlanFeatures,
  message = "This feature requires a higher plan. Upgrade in BundleGuard → Plan.",
): void {
  if (entitlements.features[feature]) return;

  throw Response.json(
    {
      ok: false,
      error: "plan_required",
      feature,
      planName: entitlements.planName,
      message,
      answer: message,
      recommendations: [],
      enabled: false,
    },
    { status: 402 },
  );
}

export function hasFeature(
  entitlements: EntitlementContext,
  feature: keyof PlanFeatures,
) {
  return Boolean(entitlements.features[feature]);
}
