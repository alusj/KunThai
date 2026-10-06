// Sign in with Apple token revocation, run when a KunThai account is deleted.
//
// Apple requires apps that offer Sign in with Apple to revoke the user's
// Apple tokens on account deletion. The app re-confirms with Apple (system
// sheet) to get a fresh one-time authorization code; this endpoint exchanges
// it for Apple tokens and revokes them straight away. Nothing is stored.
//
// Server-only configuration (Vercel environment, never VITE_-prefixed):
//   APPLE_TEAM_ID      Apple Developer Team ID
//   APPLE_KEY_ID       Key ID of the Sign in with Apple key
//   APPLE_PRIVATE_KEY  Contents of that .p8 key (PEM; "\n" escapes accepted)
//   APPLE_CLIENT_IDS   Optional. Allowed client IDs, comma separated.
//
// The Apple client secret is signed here per request and expires in five
// minutes, so this path never depends on the long-lived secret pasted into
// Supabase. No secret, code or token is ever logged or returned.

import { createPrivateKey, sign } from "node:crypto";

const APPLE_AUDIENCE = "https://appleid.apple.com";
const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const DEFAULT_CLIENT_IDS = ["app.kunthai.mobile", "app.kunthai.auth"];
const CLIENT_SECRET_TTL_SECONDS = 300;

export class AppleRevokeError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function base64Url(value) {
  return Buffer.from(value).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function readAppleConfig(env = process.env) {
  const teamId = String(env.APPLE_TEAM_ID || "").trim();
  const keyId = String(env.APPLE_KEY_ID || "").trim();
  const privateKey = String(env.APPLE_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  const clientIds = String(env.APPLE_CLIENT_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!teamId || !keyId || !privateKey) return null;
  return { teamId, keyId, privateKey, clientIds: clientIds.length ? clientIds : DEFAULT_CLIENT_IDS };
}

// ES256 JWT Apple accepts as `client_secret` for this client ID.
export function createAppleClientSecret({ teamId, keyId, privateKey }, clientId, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    iss: teamId,
    iat: nowSeconds,
    exp: nowSeconds + CLIENT_SECRET_TTL_SECONDS,
    aud: APPLE_AUDIENCE,
    sub: clientId,
  }));
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key: createPrivateKey(privateKey),
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${payload}.${base64Url(signature)}`;
}

// The id_token arrives directly from Apple's token endpoint over TLS in this
// server-to-server call, so its claims are read, not re-verified.
export function readJwtClaims(token) {
  try {
    const part = String(token || "").split(".")[1] || "";
    return JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

// The Apple user ID (`sub`) linked to this KunThai account, or "".
export function appleSubjectForUser(user) {
  const identity = (user?.identities || []).find((item) => item?.provider === "apple");
  if (!identity) return "";
  return String(identity.identity_data?.sub || identity.id || "");
}

async function postForm(fetchImpl, url, fields) {
  return fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(fields).toString(),
  });
}

// Exchanges the code and revokes the resulting tokens for `user`.
// Resolves { revoked: boolean, reason?: string }; throws AppleRevokeError.
export async function revokeAppleForUser({ user, authorizationCode, clientId, config, fetchImpl = fetch }) {
  const appleSubject = appleSubjectForUser(user);
  if (!appleSubject) return { revoked: false, reason: "no_apple_identity" };

  if (!config) throw new AppleRevokeError(503, "apple_revoke_unconfigured", "Apple disconnection is not configured.");
  if (!config.clientIds.includes(clientId)) throw new AppleRevokeError(400, "invalid_client", "Unknown Apple client.");
  const code = String(authorizationCode || "").trim();
  if (!code || code.length > 2048) throw new AppleRevokeError(400, "invalid_code", "Apple confirmation is missing.");

  const clientSecret = createAppleClientSecret(config, clientId);

  const tokenResponse = await postForm(fetchImpl, APPLE_TOKEN_URL, {
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const tokens = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !(tokens.refresh_token || tokens.access_token)) {
    throw new AppleRevokeError(502, "apple_token_exchange_failed", "Apple did not confirm this request. Please try again.");
  }

  // The confirmation must come from the same Apple ID linked to this account,
  // so nobody can revoke (or delete) using a different Apple ID.
  const claims = readJwtClaims(tokens.id_token);
  if (!claims || claims.sub !== appleSubject || claims.aud !== clientId) {
    throw new AppleRevokeError(403, "apple_account_mismatch", "Confirm with the Apple ID used for this KunThai account.");
  }

  const token = tokens.refresh_token || tokens.access_token;
  const revokeResponse = await postForm(fetchImpl, APPLE_REVOKE_URL, {
    client_id: clientId,
    client_secret: clientSecret,
    token,
    token_type_hint: tokens.refresh_token ? "refresh_token" : "access_token",
  });
  if (!revokeResponse.ok) {
    throw new AppleRevokeError(502, "apple_revoke_failed", "Apple could not disconnect KunThai right now. Please try again.");
  }

  return { revoked: true };
}
