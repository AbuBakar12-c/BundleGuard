/**
 * Simple in-memory rate limiter for app-proxy endpoints.
 * Good enough for single-instance; replace with Redis in multi-instance prod.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(options: {
  key: string;
  limit: number;
  windowMs: number;
}): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const existing = buckets.get(options.key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(options.key, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return { ok: true };
  }

  if (existing.count >= options.limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { ok: true };
}

export function clientIpFromRequest(request: Request) {
  // Prefer headers a trusted edge sets itself and never forwards verbatim
  // from the client (cf-connecting-ip/x-real-ip are overwritten by the
  // proxy, not appended-to) — these can't be spoofed by the request itself.
  const trusted =
    request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip");
  if (trusted) return trusted.trim() || "unknown";

  // x-forwarded-for is a comma-separated hop chain where each proxy APPENDS
  // its observed peer. The leftmost entry is whatever the original client
  // sent and is fully attacker-controlled (an attacker can prepend a fake
  // IP to evade their own rate limit, or target a specific victim's bucket
  // to exhaust it). The rightmost entry is the peer our own edge actually
  // observed, so it's the only hop in this header we can trust.
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((h) => h.trim()).filter(Boolean);
    return hops[hops.length - 1] || "unknown";
  }
  return "unknown";
}

/** Periodic cleanup to avoid unbounded map growth */
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref?.();
