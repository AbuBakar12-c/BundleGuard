/**
 * Safe public API helpers — never leak stack traces / secrets to clients.
 */

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

/** Log server-side detail; return a generic client message. */
export function logAndPublicError(
  scope: string,
  error: unknown,
  status = 500,
  clientMessage = "Something went wrong. Please try again.",
) {
  const detail =
    error instanceof Error ? error.message : String(error ?? "unknown");
  console.error(`[${scope}]`, detail);
  return publicError(status, "internal_error", clientMessage);
}

export function normalizeShopDomain(shop: string | null | undefined) {
  if (!shop) return null;
  const cleaned = shop.trim().toLowerCase().replace(/^https?:\/\//, "");
  if (!cleaned.includes(".")) return null;
  // Basic myshopify / custom domain shape
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(cleaned)) return null;
  return cleaned;
}
