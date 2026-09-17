import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticateAdminWithBilling } from "../shopify.server";
import { shouldEnforceBilling, PRO_PLAN } from "../billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billingCheck } = await authenticateAdminWithBilling(request);
  const subscriptionName = billingCheck.appSubscriptions[0]?.name ?? null;
  // When SHOPIFY_BILLING_TEST unlocks features, show Pro so nav isn't blank "Plan"
  const planName =
    subscriptionName ??
    (shouldEnforceBilling() ? null : `${PRO_PLAN} (dev)`);

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    planName,
  };
};

export default function App() {
  const { apiKey, planName } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/audits">Audits</s-link>
        <s-link href="/app/ai">AI</s-link>
        <s-link href="/app/pricing">
          {planName ? `Plan · ${planName}` : "Plan"}
        </s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
