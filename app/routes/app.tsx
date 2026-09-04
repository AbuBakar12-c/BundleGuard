import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { requirePaidPlan } from "../billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const billingCheck = await requirePaidPlan(request, billing);

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    planName: billingCheck.appSubscriptions[0]?.name ?? null,
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
