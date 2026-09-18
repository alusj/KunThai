// Which sub-endpoint a router function (api/payments/[action].js,
// api/cron/[job].js) was called for.
//
// Vercel fills req.query[param] from the dynamic file segment. The last path
// segment is the fallback: it is the same name whether the request arrived on
// the legacy URL (/api/monime-webhook) or the rewritten one
// (/api/payments/monime-webhook).
export function resolveRouteAction(req, param) {
  const fromQuery = req.query?.[param];
  const value = Array.isArray(fromQuery) ? fromQuery[0] : fromQuery;
  if (value) return String(value);

  const pathname = String(req.url || "").split("?")[0];
  const last = pathname.split("/").filter(Boolean).pop() || "";
  try {
    return decodeURIComponent(last);
  } catch {
    return "";
  }
}
