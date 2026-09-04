/**
 * Outbound merchant notifications (Slack / Zapier / Make / custom webhook).
 * Set MERCHANT_ALERT_WEBHOOK_URL to a POST endpoint that accepts JSON.
 */

export type BlockedAlertPayload = {
  type: "bundle_blocked";
  shop: string;
  bundleId: string;
  bundleTitle: string;
  status: string;
  blockReason: string | null;
  availableQuantity: number;
  gapCount: number;
  at: string;
};

export async function notifyBundleBlocked(payload: BlockedAlertPayload) {
  const url = process.env.MERCHANT_ALERT_WEBHOOK_URL?.trim();
  if (!url) return { sent: false as const, reason: "not_configured" };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "BundleGuard/1.0",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(
        "[alerts] webhook failed",
        response.status,
        await response.text().catch(() => ""),
      );
      return { sent: false as const, reason: "http_error" };
    }

    return { sent: true as const };
  } catch (error) {
    console.error("[alerts] webhook error", error);
    return { sent: false as const, reason: "network_error" };
  }
}
