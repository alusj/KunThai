// CORS for the KunThai Capacitor apps.
//
// The web app calls /api on its own origin and needs no CORS. The native apps
// load the UI from the device — https://localhost (Android) and
// capacitor://localhost (iOS) — and call https://kunthai.app/api cross-origin,
// so only those two origins are allowed. Requests authenticate with a bearer
// token, never cookies, so credentials are not enabled.
//
// Returns true when the request was a preflight and has been answered; the
// caller must then stop.
export const NATIVE_APP_ORIGINS = new Set(["https://localhost", "capacitor://localhost"]);

export function handleCors(req, res) {
  const origin = String(req.headers?.origin || "");
  if (NATIVE_APP_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept");
    res.setHeader("Access-Control-Max-Age", "86400");
  }

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}
