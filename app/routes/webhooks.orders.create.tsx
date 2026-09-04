import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { syncAllBundles } from "../services/bundles.server";
import { claimWebhookDelivery } from "../services/shop-data.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, shop, topic } = await authenticate.webhook(request);
  const webhookId = request.headers.get("x-shopify-webhook-id");

  console.log(`[BundleGuard] Received ${topic} webhook for ${shop}`);

  if (!admin) {
    return new Response();
  }

  const shouldProcess = await claimWebhookDelivery({
    shop,
    topic: String(topic),
    webhookId,
  });
  if (!shouldProcess) {
    return new Response();
  }

  try {
    await syncAllBundles(admin, shop);
  } catch (error) {
    console.error(`[BundleGuard] orders/create sync failed for ${shop}`, error);
  }

  return new Response();
};
