import { redirect } from "react-router";
import type { BillingPlanName, PlanFeatures } from "../plans";
import {
  BILLING_PLANS,
  GROWTH_PLAN,
  PRO_PLAN,
  STARTER_PLAN,
} from "../plans";
import { isTestCharge, shouldEnforceBilling } from "../billing.server";
import {
  resolveEntitlementsFromBilling,
  type EntitlementContext,
} from "./entitlements.server";

type BillingCheck = {
  check: (options: {
    plans: BillingPlanName[];
    isTest?: boolean;
  }) => Promise<{
    hasActivePayment: boolean;
    appSubscriptions: Array<{ name: string; id: string }>;
  }>;
};

export async function getPlanContext(
  billing: BillingCheck,
  shop = "admin",
): Promise<EntitlementContext & { planName: string | null }> {
  // Prefer centralized entitlements; shop string is for logging context
  return resolveEntitlementsFromBilling(shop, billing);
}

export function requireFeature(
  features: PlanFeatures,
  feature: keyof PlanFeatures,
  upgradePath = "/app/pricing",
) {
  if (features[feature]) return;
  throw redirect(upgradePath);
}

export function planLabelForFeature(feature: keyof PlanFeatures): string {
  if (feature === "locationAudit" || feature === "shopperAi") return PRO_PLAN;
  if (
    feature === "oosAudit" ||
    feature === "merchantAi" ||
    feature === "blockedAlerts"
  ) {
    return GROWTH_PLAN;
  }
  return STARTER_PLAN;
}

export { BILLING_PLANS, shouldEnforceBilling, isTestCharge };
