// Keeps the sign-in token small.
//
// Supabase copies the account's user_metadata into every access token. An
// account whose metadata held a large value (an embedded picture, a long
// pasted text) ends up with a token too big for some servers: Vercel answered
// 494 "request header too large" and Storage refused it ("Invalid Compact
// JWS"), so that account could not upload. Large values are cleared from the
// metadata; the profile itself lives in its own tables.

// Tokens normally stay well under 2,000 characters.
export const OVERSIZED_TOKEN_CHARS = 4000;
const MAX_METADATA_VALUE_CHARS = 1000;

export function decodeTokenPayload(token) {
  const part = String(token || "").split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

// The metadata keys to clear: embedded files (data: URLs) and any value whose
// stored form is longer than MAX_METADATA_VALUE_CHARS.
export function oversizedMetadataPatch(metadata) {
  const patch = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    if (value == null) continue;
    const text = typeof value === "string" ? value : JSON.stringify(value);
    if (typeof value === "string" && value.startsWith("data:")) patch[key] = null;
    else if (String(text || "").length > MAX_METADATA_VALUE_CHARS) patch[key] = null;
  }
  return Object.keys(patch).length ? patch : null;
}

export function isOversizedToken(token) {
  return String(token || "").length > OVERSIZED_TOKEN_CHARS;
}
