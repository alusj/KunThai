import assert from "node:assert/strict";
import test from "node:test";

import { hasStoredSession, isLikelySignedIn, urlCarriesSignIn } from "./startupSession.js";

function memoryStorage(entries = {}) {
  const keys = Object.keys(entries);
  return { length: keys.length, key: (i) => keys[i] ?? null, getItem: (k) => entries[k] ?? null };
}

test("a stored Supabase session counts as signed in", () => {
  assert.equal(hasStoredSession(memoryStorage({ "sb-abc-auth-token": '{"access_token":"x","refresh_token":"y"}' })), true);
});

test("no session, an empty value or only a PKCE verifier is signed out", () => {
  assert.equal(hasStoredSession(memoryStorage({})), false);
  assert.equal(hasStoredSession(memoryStorage({ "sb-abc-auth-token": "" })), false);
  assert.equal(hasStoredSession(memoryStorage({ "sb-abc-auth-token-code-verifier": "v" })), false);
  assert.equal(hasStoredSession(memoryStorage({ "kunthai.theme": "dark" })), false);
});

test("blocked storage assumes a session may exist", () => {
  const blocked = { get length() { throw new Error("blocked"); } };
  assert.equal(hasStoredSession(blocked), true);
});

test("an OAuth or email-link return is a sign-in in progress", () => {
  assert.equal(urlCarriesSignIn({ search: "?code=abc" }), true);
  assert.equal(urlCarriesSignIn({ search: "?token_hash=abc&type=recovery" }), true);
  assert.equal(urlCarriesSignIn({ hash: "#access_token=a&refresh_token=b" }), true);
  assert.equal(urlCarriesSignIn({ search: "?ref=share", hash: "" }), false);
  assert.equal(isLikelySignedIn({ storage: memoryStorage({}), location: { search: "?code=1" } }), true);
  assert.equal(isLikelySignedIn({ storage: memoryStorage({}), location: { search: "" } }), false);
});
