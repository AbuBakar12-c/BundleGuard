export const STARTER_PLAN = "Starter";
export const GROWTH_PLAN = "Growth";
export const PRO_PLAN = "Pro";

export const BILLING_PLANS = [STARTER_PLAN, GROWTH_PLAN, PRO_PLAN] as const;

export type BillingPlanName = (typeof BILLING_PLANS)[number];

export type PlanFeatures = {
  oosAudit: boolean;
  locationAudit: boolean;
  merchantAi: boolean;
  shopperAi: boolean;
  blockedAlerts: boolean;
};

export const PLAN_DETAILS: Record<
  BillingPlanName,
  {
    amount: number;
    bundleLimit: number;
    description: string;
    features: PlanFeatures;
  }
> = {
  [STARTER_PLAN]: {
    amount: 19,
    bundleLimit: 10,
    description: "Health dashboard and manual resync for up to 10 bundles",
    features: {
      oosAudit: false,
      locationAudit: false,
      merchantAi: false,
      shopperAi: false,
      blockedAlerts: false,
    },
  },
  [GROWTH_PLAN]: {
    amount: 39,
    bundleLimit: 50,
    description: "OOS audit, merchant AI, and order webhooks for up to 50 bundles",
    features: {
      oosAudit: true,
      locationAudit: false,
      merchantAi: true,
      shopperAi: false,
      blockedAlerts: true,
    },
  },
  [PRO_PLAN]: {
    amount: 79,
    bundleLimit: Number.POSITIVE_INFINITY,
    description:
      "Unlimited bundles, multi-location audit, Shopper AI, and blocked alerts",
    features: {
      oosAudit: true,
      locationAudit: true,
      merchantAi: true,
      shopperAi: true,
      blockedAlerts: true,
    },
  },
};

export function bundleLimitForPlan(planName: string | undefined) {
  if (planName && planName in PLAN_DETAILS) {
    return PLAN_DETAILS[planName as BillingPlanName].bundleLimit;
  }
  return PLAN_DETAILS[STARTER_PLAN].bundleLimit;
}

export function featuresForPlan(planName: string | undefined): PlanFeatures {
  if (planName && planName in PLAN_DETAILS) {
    return PLAN_DETAILS[planName as BillingPlanName].features;
  }
  return PLAN_DETAILS[STARTER_PLAN].features;
}

/** When billing is not enforced (local/dev), unlock Pro features for testing. */
export function effectiveFeatures(
  planName: string | undefined,
  billingEnforced: boolean,
): PlanFeatures {
  if (!billingEnforced) {
    return PLAN_DETAILS[PRO_PLAN].features;
  }
  return featuresForPlan(planName);
}

export function isPricingPath(pathname: string) {
  return pathname === "/app/pricing" || pathname.endsWith("/app/pricing");
}
