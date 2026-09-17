/**
 * Safe public API helpers — never leak stack traces / secrets to clients.
 */

export function newRequestId() {
  return `bg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function publicJson(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

export function publicError(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  return Response.json(
    {
      ok: false,
      error: code,
      message,
      ...extra,
    },
    { status },
  );
}

/**
 * Thrown by service functions for failures that are already safe, curated
 * merchant-facing text (e.g. a Shopify GraphQL validation message). Anything
 * NOT thrown as this type is treated as an unexpected internal error and
 * never shown to the client verbatim — see `safeActionError`.
 */
export class UserFacingError extends Error {}

/**
 * For non-JSON UI routes (React Router `action` returning plain data, not a
 * Response) that want the same "never leak internals" guarantee as
 * `logAndPublicError` without changing their `{ error }` return shape.
 */
export function safeActionError(scope: string, error: unknown) {
  if (error instanceof UserFacingError) {
    return { error: error.message };
  }
  const requestId = newRequestId();
  const detail =
    error instanceof Error ? error.message : String(error ?? "unknown");
  console.error(
    JSON.stringify({ level: "error", scope, requestId, detail }),
  );
  return {
    error: `Something went wrong. Please try again. (ref: ${requestId})`,
  };
}

/** Log server-side detail; return a generic client message + correlation id. */
export function logAndPublicError(
  scope: string,
  error: unknown,
  status = 500,
  clientMessage = "Something went wrong. Please try again.",
) {
  const requestId = newRequestId();
  const detail =
    error instanceof Error ? error.message : String(error ?? "unknown");
  console.error(
    JSON.stringify({
      level: "error",
      scope,
      requestId,
      detail,
      // Never include stack / secrets in structured client-facing payloads.
    }),
  );
  return publicError(status, "internal_error", clientMessage, { requestId });
}

/**
 * Structured failure log for webhook handlers that must still return 200 to
 * Shopify (to avoid an infinite-retry storm on a transient bug) — without
 * this, a genuinely failed uninstall purge or GDPR redact is only visible
 * as an unmonitored console.error line.
 *
 * Two different audiences get two different amounts of detail:
 * - Server-side structured log: full error detail, stays in the app's own
 *   log platform (only the account owner can read it).
 * - Optional external ops alert (OPS_ALERT_WEBHOOK_URL, e.g. Slack/Zapier):
 *   deliberately carries NO error text and NO payload/customer data — only
 *   shop + topic + timestamp, enough to point an operator at the right logs
 *   without ever transmitting potentially sensitive detail to a third-party
 *   endpoint this app doesn't control the retention of.
 */
export async function logWebhookFailure(
  topic: string,
  shop: string,
  error: unknown,
) {
  const detail =
    error instanceof Error ? error.message : String(error ?? "unknown");
  const at = new Date().toISOString();
  console.error(
    JSON.stringify({ level: "error", scope: "webhook", topic, shop, detail, at }),
  );

  const url = process.env.OPS_ALERT_WEBHOOK_URL?.trim();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "BundleGuard/1.0",
      },
      body: JSON.stringify({ type: "webhook_processing_failed", topic, shop, at }),
    });
  } catch {
    // Best-effort only — the alert channel must never break webhook processing.
  }
}

export function normalizeShopDomain(shop: string | null | undefined) {
  if (!shop) return null;
  const cleaned = shop.trim().toLowerCase().replace(/^https?:\/\//, "");
  if (!cleaned.includes(".")) return null;
  // Basic myshopify / custom domain shape
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(cleaned)) return null;
  return cleaned;
}
