import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logWebhookFailure } from "../services/http.server";
import { claimWebhookDelivery } from "../services/shop-data.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const webhookId = request.headers.get("x-shopify-webhook-id");
  const shouldProcess = await claimWebhookDelivery({
    shop,
    topic,
    webhookId,
  });
  if (!shouldProcess) {
    return new Response();
  }

  const current = payload.current as string[];
  if (session) {
    try {
      await db.session.update({
        where: {
          id: session.id,
        },
        data: {
          scope: current.toString(),
        },
      });
    } catch (error) {
      // Acknowledge anyway (consistent with the other webhook handlers) —
      // the granted scope is still correct at Shopify; only our cached
      // Session.scope column is stale until the next successful update.
      await logWebhookFailure("app/scopes_update", shop, error);
    }
  }
  return new Response();
};
