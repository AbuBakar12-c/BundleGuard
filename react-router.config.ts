import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  // Load all routes on first paint so Admin navigation does not fetch
  // /__manifest over a stale Cloudflare tunnel (ERR_NAME_NOT_RESOLVED).
  routeDiscovery: {
    mode: "initial",
  },
} satisfies Config;
