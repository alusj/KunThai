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
// An account with no email (Facebook shared none, e.g. a phone-number Facebook
// account) cannot get that one-time token, so it is given an internal sign-in
// address first: fb_<facebook id>@kunthai.invalid, already confirmed, never
// emailed (".invalid" cannot receive mail) and never shown: the app clears it
// (src/Backend/services/placeholderEmail.js) and the database triggers skip
// it (public.kunthai_visible_email). If Facebook does share an email, the
// account gets that real address instead.
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
const PLACEHOLDER_EMAIL_DOMAIN = "kunthai.invalid";

function placeholderEmail(facebookId: string) {
  return `fb_${facebookId}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

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

    let match = Array.isArray(matches) ? matches[0] : null;
    if (!match) {
      // An account this function created earlier on the internal sign-in
      // address has no Facebook identity row; it is found by that address.
      const { data: placeholderMatches, error: placeholderError } = await admin.rpc("kunthai_facebook_signin_lookup", {
        p_facebook_id: facebookId,
        p_email: placeholderEmail(facebookId),
      });
      if (placeholderError) throw placeholderError;
      match = Array.isArray(placeholderMatches) ? placeholderMatches[0] : null;
    }
    let email = String(match?.email || "");
    let created = false;
    let userId = String(match?.user_id || "");

    if (!match) {
      // Facebook shared no email: the account is created on its internal
      // sign-in address and reads as an account without an email.
      const signInEmail = facebookEmail || placeholderEmail(facebookId);
      const picture = profile.picture?.data?.is_silhouette ? "" : profile.picture?.data?.url || "";
      const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
        email: signInEmail,
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
          ...(facebookEmail ? { email: facebookEmail, email_verified: true } : {}),
          signed_in_with: "facebook_native",
          // A new account has not been through onboarding. Saved here, at
          // creation, so the app never mistakes it for a returning member
          // (it gets an automatic Explore profile the moment it exists).
          onboarding_complete: false,
          onboarding_step: 1,
        },
      });
      if (createError) throw createError;
      email = signInEmail;
      created = true;
      userId = String(createdUser?.user?.id || "");
    }

    // The account carries this person's Facebook identity, so a sign-in that
    // goes through the sign-in service itself (iPhone Limited Login) reaches
    // the same account instead of making a second one. A repeat does nothing.
    if (userId && (created || match?.matched_by !== "facebook")) {
      const { error: linkIdentityError } = await admin.rpc("kunthai_link_facebook_identity", {
        p_user_id: userId,
        p_facebook_id: facebookId,
        p_identity: {
          name: profile.name || "",
          full_name: profile.name || "",
          ...(facebookEmail ? { email: facebookEmail, email_verified: true } : {}),
          provider_id: facebookId,
        },
      });
      if (linkIdentityError) console.error("facebook-native-signin: identity link failed");
    }

    if (!email && match?.user_id) {
      // The account linked to this Facebook person has no email, so there is
      // nothing to issue a one-time token for. Give it Facebook's own email
      // when Facebook shares one and no other account has it; otherwise the
      // internal sign-in address. Confirmed at once: nothing is sent.
      const candidates = facebookEmail ? [facebookEmail, placeholderEmail(facebookId)] : [placeholderEmail(facebookId)];
      for (const candidate of candidates) {
        const { error: updateError } = await admin.auth.admin.updateUserById(match.user_id, {
          email: candidate,
          email_confirm: true,
        });
        if (!updateError) {
          email = candidate;
          break;
        }
      }
    }

    if (!email) {
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
