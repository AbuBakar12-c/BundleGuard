import { redirect } from "react-router";
import {
  BillingInterval,
  BillingReplacementBehavior,
} from "@shopify/shopify-app-react-router/server";
import type {
  BillingConfig,
  BillingConfigSubscriptionLineItemPlan,
} from "@shopify/shopify-api";
import {
  GROWTH_PLAN,
  PLAN_DETAILS,
  PRO_PLAN,
  STARTER_PLAN,
  isPricingPath,
  type BillingPlanName,
} from "./plans";

export {
  BILLING_PLANS,
  GROWTH_PLAN,
  PLAN_DETAILS,
  PRO_PLAN,
  STARTER_PLAN,
  bundleLimitForPlan,
  isPricingPath,
  type BillingPlanName,
} from "./plans";

function thirtyDayPlan(amount: number): BillingConfigSubscriptionLineItemPlan {
  return {
    trialDays: 14,
    replacementBehavior: BillingReplacementBehavior.ApplyImmediately,
    lineItems: [
      {
        amount,
        currencyCode: "USD",
        interval: BillingInterval.Every30Days,
      },
    ],
  };
}

export const billingConfig: BillingConfig = {
  [STARTER_PLAN]: thirtyDayPlan(PLAN_DETAILS[STARTER_PLAN].amount),
  [GROWTH_PLAN]: thirtyDayPlan(PLAN_DETAILS[GROWTH_PLAN].amount),
  [PRO_PLAN]: thirtyDayPlan(PLAN_DETAILS[PRO_PLAN].amount),
};

export function isTestCharge() {
  // Explicit flag wins; otherwise use test charges outside production.
  if (process.env.SHOPIFY_BILLING_TEST === "true") return true;
  if (process.env.SHOPIFY_BILLING_TEST === "false") return false;
  return process.env.NODE_ENV !== "production";
}

/**
 * Fail closed in production: billing is enforced unless explicitly disabled
 * with SHOPIFY_BILLING_TEST=true (local/dev only).
 */
export function shouldEnforceBilling() {
  if (process.env.SHOPIFY_BILLING_TEST === "true") return false;
  if (process.env.SHOPIFY_BILLING_TEST === "false") return true;
  return process.env.NODE_ENV === "production";
}

export async function requirePaidPlan(
  request: Request,
  billing: {
    require: (options: {
      plans: BillingPlanName[];
      isTest?: boolean;
      onFailure: (error: unknown) => Promise<Response>;
    }) => Promise<{ appSubscriptions: Array<{ name: string; id: string }> }>;
    check?: (options: {
      plans: BillingPlanName[];
      isTest?: boolean;
    }) => Promise<{
      hasActivePayment: boolean;
      appSubscriptions: Array<{ name: string; id: string }>;
    }>;
  },
) {
  const url = new URL(request.url);
  if (isPricingPath(url.pathname)) {
    return { appSubscriptions: [] as Array<{ name: string; id: string }> };
  }

  if (!shouldEnforceBilling()) {
    const checked = await billing.check?.({
      plans: [STARTER_PLAN, GROWTH_PLAN, PRO_PLAN],
      isTest: isTestCharge(),
    });
    return {
      appSubscriptions: checked?.appSubscriptions ?? [],
    };
  }

  return billing.require({
    plans: [STARTER_PLAN, GROWTH_PLAN, PRO_PLAN],
    isTest: isTestCharge(),
    onFailure: async () => redirect(`/app/pricing${url.search}`),
  });
}
