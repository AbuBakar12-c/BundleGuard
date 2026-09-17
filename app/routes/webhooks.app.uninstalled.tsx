import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { logWebhookFailure } from "../services/http.server";
import {
  claimWebhookDelivery,
  purgeShopData,
} from "../services/shop-data.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  const webhookId = request.headers.get("x-shopify-webhook-id");

  console.log(`[BundleGuard] Received ${topic} webhook for ${shop}`);

  const shouldProcess = await claimWebhookDelivery({
    shop,
    topic: String(topic),
    webhookId,
  });
  if (!shouldProcess) {
    return new Response();
  }

  try {
    await purgeShopData(shop);
    console.log(`[BundleGuard] Purged all shop data after uninstall: ${shop}`);
  } catch (error) {
    await logWebhookFailure("app/uninstalled", shop, error);
    try {
      const db = (await import("../db.server")).default;
      await db.session.deleteMany({ where: { shop } });
    } catch (sessionError) {
      await logWebhookFailure("app/uninstalled:session_cleanup", shop, sessionError);
    }
  }

  return new Response();
};
