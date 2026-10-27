// Native "Continue with Facebook": turns the Facebook access token from the
// phone's Facebook SDK (KunThaiFacebookLogin plugin) into a KunThai session.
//
// Supabase Auth only takes Facebook OIDC tokens from iOS Limited Login, and
// the Facebook app switch (the one-tap sign-in) returns a classic access
// token, so this function:
//   1. asks Facebook which app the token was issued to (GET /app) and refuses
//      any token that is not for KunThai's Facebook app,
//   2. reads the person's Facebook id, name and email (GET /me),
//   3. finds their KunThai account: the one with that Facebook identity (from
//      the web sign-in), else the one with the same Facebook-verified email
//      (public.kunthai_facebook_signin_lookup), else creates it,
//   4. returns a one-time sign-in token hash (admin generateLink, nothing is
//      emailed) that the app redeems with supabase.auth.verifyOtp.
//
// Environment: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (provided by Supabase),
// optional FACEBOOK_APP_ID (defaults to KunThai's) and FACEBOOK_APP_SECRET
// (only needed if "Require App Secret" is on in the Facebook app; then every
// Graph call carries appsecret_proof). Tokens and emails are never logged.

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const FACEBOOK_APP_ID = Deno.env.get("FACEBOOK_APP_ID") || "1594667472308339";
const FACEBOOK_APP_SECRET = Deno.env.get("FACEBOOK_APP_SECRET") || "";
const GRAPH = "https://graph.facebook.com/v24.0";
const REQUEST_TIMEOUT_MS = 10_000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function appSecretProof(accessToken: string) {
  if (!FACEBOOK_APP_SECRET) return "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(FACEBOOK_APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(accessToken));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function graph(path: string, fields: string, accessToken: string) {
  const url = new URL(`${GRAPH}/${path}`);
  if (fields) url.searchParams.set("fields", fields);
  const proof = await appSecretProof(accessToken);
  if (proof) url.searchParams.set("appsecret_proof", proof);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, body };
}

type FacebookProfile = {
  id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  picture?: { data?: { url?: string; is_silhouette?: boolean } };
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json(405, { code: "method_not_allowed" });

  const { accessToken } = await request.json().catch(() => ({}));
  if (typeof accessToken !== "string" || accessToken.length < 20 || accessToken.length > 4096) {
    return json(400, { code: "missing_token", message: "Facebook did not return a sign-in token." });
  }

  try {
    const app = await graph("app", "id", accessToken);
    if (!app.ok || String(app.body?.id || "") !== FACEBOOK_APP_ID) {
      return json(401, { code: "invalid_token", message: "Facebook could not confirm this sign-in. Please try again." });
    }

    const me = await graph("me", "id,name,first_name,last_name,email,picture.width(512).height(512)", accessToken);
    const profile = (me.body || {}) as FacebookProfile;
    const facebookId = String(profile.id || "");
    if (!me.ok || !facebookId) {
      return json(401, { code: "invalid_token", message: "Facebook could not confirm this sign-in. Please try again." });
    }
    const facebookEmail = String(profile.email || "").trim().toLowerCase();

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: matches, error: lookupError } = await admin.rpc("kunthai_facebook_signin_lookup", {
      p_facebook_id: facebookId,
      p_email: facebookEmail,
    });
    if (lookupError) throw lookupError;

    const match = Array.isArray(matches) ? matches[0] : null;
    let email = String(match?.email || "");
    let created = false;

    if (!match) {
      // Same rule as the web sign-in: KunThai needs the Facebook email.
      if (!facebookEmail) {
        return json(422, { code: "facebook_no_email", message: "Facebook did not share your email address." });
      }
      const picture = profile.picture?.data?.is_silhouette ? "" : profile.picture?.data?.url || "";
      const { error: createError } = await admin.auth.admin.createUser({
        email: facebookEmail,
        email_confirm: true,
        user_metadata: {
          iss: "https://graph.facebook.com/me",
          sub: facebookId,
          provider_id: facebookId,
          name: profile.name || "",
          full_name: profile.name || "",
          ...(profile.first_name ? { given_name: profile.first_name } : {}),
          ...(profile.last_name ? { family_name: profile.last_name } : {}),
          ...(picture ? { avatar_url: picture, picture } : {}),
          email: facebookEmail,
          email_verified: true,
          signed_in_with: "facebook_native",
        },
      });
      if (createError) throw createError;
      email = facebookEmail;
      created = true;
    }

    if (!email) {
      // An account linked to this Facebook person but without an email (e.g.
      // a phone account) cannot get a one-time email token; the app falls
      // back to the web sign-in.
      return json(409, { code: "account_without_email", message: "Use the web Facebook sign-in for this account." });
    }

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError) throw linkError;
    const tokenHash = link?.properties?.hashed_token;
    if (!tokenHash) throw new Error("No sign-in token was generated.");

    return json(200, { tokenHash, type: "magiclink", created });
  } catch (error) {
    console.error("facebook-native-signin failed:", error instanceof Error ? error.name : "unknown");
    return json(500, { code: "server_error", message: "Facebook sign-in could not be completed. Please try again." });
  }
});
