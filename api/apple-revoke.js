// POST /api/apple-revoke — revoke Sign in with Apple tokens before a KunThai
// account is deleted. See server/auth/appleRevoke.js.
//
// Authenticated with the caller's Supabase access token; it only ever acts on
// the Apple identity linked to that signed-in account.

import { createClient } from "@supabase/supabase-js";

import { handleCors } from "../server/cors.js";
import { AppleRevokeError, readAppleConfig, revokeAppleForUser } from "../server/auth/appleRevoke.js";

function bearerToken(req) {
  const match = String(req.headers?.authorization || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function authenticatedUser(req) {
  const token = bearerToken(req);
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  // Checking "who is this token" needs no elevated rights.
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  if (!token || !url || !key) return null;

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data?.user || null;
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return undefined;
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method not allowed." });
  }

  const user = await authenticatedUser(req).catch(() => null);
  if (!user) return res.status(401).json({ ok: false, code: "unauthenticated", message: "Sign in again to continue." });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  try {
    const result = await revokeAppleForUser({
      user,
      authorizationCode: body.authorizationCode,
      clientId: String(body.clientId || ""),
      config: readAppleConfig(),
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof AppleRevokeError) {
      return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
    }
    // Never echo internals: they could include parts of Apple's response.
    console.error("[apple-revoke] unexpected failure", error?.name || "Error");
    return res.status(500).json({ ok: false, code: "apple_revoke_error", message: "Apple disconnection failed. Please try again." });
  }
}
