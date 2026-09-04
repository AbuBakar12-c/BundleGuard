import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate, isTestCharge } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  BILLING_PLANS,
  GROWTH_PLAN,
  PLAN_DETAILS,
  PRO_PLAN,
  STARTER_PLAN,
  type BillingPlanName,
} from "../plans";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const { hasActivePayment, appSubscriptions } = await billing.check({
    plans: [STARTER_PLAN, GROWTH_PLAN, PRO_PLAN],
    isTest: isTestCharge(),
  });

  return {
    hasActivePayment,
    currentPlan: appSubscriptions[0]?.name ?? null,
    isTestCharge: isTestCharge(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = String(formData.get("plan") ?? "");

  if (!BILLING_PLANS.includes(plan as BillingPlanName)) {
    return { error: "Choose a valid Shopify subscription plan" };
  }

  try {
    return await billing.request({
      plan: plan as BillingPlanName,
      isTest: isTestCharge(),
    });
  } catch (error) {
    const details = (
      error as { errorData?: Array<{ message?: string }> }
    ).errorData;
    return {
      error:
        details?.[0]?.message ??
        (error instanceof Error
          ? error.message
          : "Shopify could not create this charge"),
    };
  }
};

export default function PricingPage() {
  const { hasActivePayment, currentPlan, isTestCharge: testMode } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const pendingPlan = String(fetcher.formData?.get("plan") ?? "");

  return (
    <s-page heading="Choose your plan">
      <s-link slot="breadcrumb-actions" href="/app">
        Dashboard
      </s-link>

      {fetcher.data && "error" in fetcher.data && fetcher.data.error && (
        <s-banner heading="Shopify Billing could not start" tone="critical">
          {fetcher.data.error}
        </s-banner>
      )}

      {testMode && (
        <s-banner heading="Development mode" tone="info">
          Billing is unlocked while SHOPIFY_BILLING_TEST=true (or non-production).
          In production set SHOPIFY_BILLING_TEST=false so Shopify charges are
          required. Partner-owned apps only.
        </s-banner>
      )}

      {hasActivePayment && currentPlan && (
        <s-banner heading="Active subscription" tone="success">
          This store is on {currentPlan} with a 30-day Shopify Billing cycle.
        </s-banner>
      )}

      {!hasActivePayment && !testMode && (
        <s-banner heading="Subscription required" tone="warning">
          BundleGuard bills through Shopify only. Approve a 30-day plan to
          continue. There is a 14-day trial on every plan.
        </s-banner>
      )}

      <s-section heading="30-day Shopify subscriptions">
        <s-stack direction="block" gap="base">
          {(Object.keys(PLAN_DETAILS) as BillingPlanName[]).map((plan) => {
            const details = PLAN_DETAILS[plan];
            const limitLabel =
              details.bundleLimit === Number.POSITIVE_INFINITY
                ? "Unlimited bundles"
                : `Up to ${details.bundleLimit} bundles`;
            const isCurrent = currentPlan === plan;
            const featureBits = [
              details.features.oosAudit ? "OOS audit" : null,
              details.features.locationAudit ? "Location audit" : null,
              details.features.merchantAi ? "Merchant AI" : null,
              details.features.shopperAi ? "Shopper AI" : null,
              details.features.blockedAlerts ? "Blocked alerts" : null,
            ].filter(Boolean);

            return (
              <s-box
                key={plan}
                padding="base"
                border="base"
                borderRadius="base"
                background="subdued"
              >
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="base">
                    <s-text type="strong">{plan}</s-text>
                    {isCurrent ? <s-badge tone="success">Current</s-badge> : null}
                  </s-stack>
                  <s-paragraph>
                    ${details.amount} USD every 30 days · {limitLabel}
                  </s-paragraph>
                  <s-paragraph>{details.description}</s-paragraph>
                  <s-paragraph>
                    Includes: dashboard
                    {featureBits.length ? `, ${featureBits.join(", ")}` : ""}
                  </s-paragraph>
                  <fetcher.Form method="post">
                    <input type="hidden" name="plan" value={plan} />
                    <s-button
                      type="submit"
                      variant={isCurrent ? "secondary" : "primary"}
                      {...(pendingPlan === plan && fetcher.state !== "idle"
                        ? { loading: true }
                        : {})}
                    >
                      {isCurrent ? "Manage on Shopify" : `Start ${plan}`}
                    </s-button>
                  </fetcher.Form>
                </s-stack>
              </s-box>
            );
          })}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
