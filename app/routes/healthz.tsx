/** Liveness probe for hosts / load balancers — cheap, no dependency checks. */
export async function loader() {
  return Response.json({
    ok: true,
    service: "bundleguard",
    ts: new Date().toISOString(),
  });
}
