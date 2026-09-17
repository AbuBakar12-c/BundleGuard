import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { claimWebhookDelivery } from "../services/shop-data.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);
  const webhookId = request.headers.get("x-shopify-webhook-id");

  const shouldProcess = await claimWebhookDelivery({
    shop,
    topic: String(topic),
    webhookId,
  });
  if (!shouldProcess) {
    return new Response();
  }

  const subscription = payload.app_subscription as
    | { name?: string; status?: string; admin_graphql_api_id?: string }
    | undefined;

  console.log(
    `[BundleGuard] app_subscriptions/update for ${shop}: ${subscription?.name ?? "unknown plan"} -> ${subscription?.status ?? "unknown status"}`,
  );

  // Entitlements are re-derived live from the Billing API on every request
  // (see entitlements.server.ts) — there is no local cache to invalidate here.
  // This handler exists so a plan change/cancellation is observable in logs
  // as soon as it happens, rather than only being discovered lazily.

  return new Response();
};
