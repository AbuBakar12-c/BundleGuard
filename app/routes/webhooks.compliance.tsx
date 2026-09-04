import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  claimWebhookDelivery,
  exportCustomerData,
  purgeShopData,
  redactCustomerData,
  storeComplianceExport,
} from "../services/shop-data.server";

/**
 * Mandatory App Store compliance webhooks:
 * customers/data_request, customers/redact, shop/redact
 *
 * HMAC verified by authenticate.webhook. All mutations are shop-scoped.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const webhookId = request.headers.get("x-shopify-webhook-id");

  console.log(`[BundleGuard] Compliance webhook ${topic} for ${shop}`);

  try {
    const shouldProcess = await claimWebhookDelivery({
      shop,
      topic: String(topic),
      webhookId,
    });
    if (!shouldProcess) {
      console.log(
        `[BundleGuard] Duplicate compliance webhook ignored ${topic} ${webhookId}`,
      );
      return new Response();
    }

    const body = (payload ?? {}) as {
      shop_domain?: string;
      customer?: { email?: string; id?: number };
    };
    // Prefer authenticated webhook shop — never trust payload alone for tenant scope
    const domain = shop;
    const email = body.customer?.email ?? null;

    switch (topic) {
      case "CUSTOMERS_DATA_REQUEST":
      case "customers/data_request": {
        const data = await exportCustomerData(domain, email);
        await storeComplianceExport({
          shop: domain,
          topic: "customers/data_request",
          email,
          payload: data,
        });
        const support = process.env.SUPPORT_EMAIL?.trim();
        console.log(
          `[BundleGuard] customers/data_request stored for ${domain}` +
            (support ? ` (notify ${support})` : " (set SUPPORT_EMAIL to notify)"),
          JSON.stringify({
            hasEmail: Boolean(data.email),
            leadCount: data.leads.length,
            messageCount: data.messages.length,
          }),
        );
        break;
      }
      case "CUSTOMERS_REDACT":
      case "customers/redact": {
        const result = await redactCustomerData(domain, email);
        console.log(
          `[BundleGuard] customers/redact for ${domain}`,
          JSON.stringify(result),
        );
        break;
      }
      case "SHOP_REDACT":
      case "shop/redact": {
        await purgeShopData(domain);
        console.log(`[BundleGuard] shop/redact purged all data for ${domain}`);
        break;
      }
      default:
        console.warn(`[BundleGuard] Unhandled compliance topic: ${topic}`);
    }
  } catch (error) {
    console.error(`[BundleGuard] Compliance webhook failed (${topic})`, error);
    // Acknowledge so Shopify does not infinite-retry on transient bugs.
  }

  return new Response();
};
