import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import test from "node:test";

import {
  AppleRevokeError,
  appleSubjectForUser,
  createAppleClientSecret,
  readAppleConfig,
  readJwtClaims,
  revokeAppleForUser,
} from "./appleRevoke.js";

// Throwaway P-256 key generated per test run; never a real Apple key.
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const config = {
  teamId: "TEAM123456",
  keyId: "KEY1234567",
  privateKey: privateKey.export({ type: "pkcs8", format: "pem" }),
  clientIds: ["app.kunthai.mobile", "app.kunthai.auth"],
};

function fakeIdToken(claims) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part(claims)}.sig`;
}

const appleUser = {
  id: "user-1",
  identities: [
    { provider: "google", id: "g-1", identity_data: { sub: "g-1" } },
    { provider: "apple", id: "apple-sub-1", identity_data: { sub: "apple-sub-1" } },
  ],
};

function fakeApple({ tokenOk = true, sub = "apple-sub-1", aud = "app.kunthai.mobile", revokeOk = true } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: new URLSearchParams(init.body) });
    if (url.endsWith("/auth/token")) {
      return {
        ok: tokenOk,
        json: async () => (tokenOk ? { refresh_token: "r-token", access_token: "a-token", id_token: fakeIdToken({ sub, aud }) } : { error: "invalid_grant" }),
      };
    }
    return { ok: revokeOk, json: async () => ({}) };
  };
  return { calls, fetchImpl };
}

test("client secret is a valid short-lived ES256 JWT for the client ID", () => {
  const jwt = createAppleClientSecret(config, "app.kunthai.mobile", 1_000_000);
  const [header, payload, signature] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url")), { alg: "ES256", kid: "KEY1234567", typ: "JWT" });
  assert.deepEqual(readJwtClaims(jwt), {
    iss: "TEAM123456",
    iat: 1_000_000,
    exp: 1_000_300,
    aud: "https://appleid.apple.com",
    sub: "app.kunthai.mobile",
  });
  const valid = verify("sha256", Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"));
  assert.equal(valid, true);
});

test("config is read from server env, accepting escaped newlines", () => {
  assert.equal(readAppleConfig({}), null);
  const escaped = readAppleConfig({ APPLE_TEAM_ID: "T", APPLE_KEY_ID: "K", APPLE_PRIVATE_KEY: "line1\\nline2" });
  assert.equal(escaped.privateKey, "line1\nline2");
  assert.deepEqual(escaped.clientIds, ["app.kunthai.mobile", "app.kunthai.auth"]);
});

test("accounts without an Apple identity are left alone", async () => {
  const { calls, fetchImpl } = fakeApple();
  const user = { identities: [{ provider: "google", id: "g" }, { provider: "phone", id: "p" }] };
  assert.deepEqual(await revokeAppleForUser({ user, authorizationCode: "c", clientId: "app.kunthai.mobile", config, fetchImpl }), {
    revoked: false,
    reason: "no_apple_identity",
  });
  assert.equal(calls.length, 0);
  assert.equal(appleSubjectForUser({}), "");
});

test("a confirmed Apple account is exchanged then revoked with the refresh token", async () => {
  const { calls, fetchImpl } = fakeApple();
  const result = await revokeAppleForUser({ user: appleUser, authorizationCode: "code-1", clientId: "app.kunthai.mobile", config, fetchImpl });
  assert.deepEqual(result, { revoked: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.get("grant_type"), "authorization_code");
  assert.equal(calls[0].body.get("code"), "code-1");
  assert.equal(calls[1].url, "https://appleid.apple.com/auth/revoke");
  assert.equal(calls[1].body.get("token"), "r-token");
  assert.equal(calls[1].body.get("token_type_hint"), "refresh_token");
});

test("a different Apple ID cannot revoke this account", async () => {
  const { calls, fetchImpl } = fakeApple({ sub: "someone-else" });
  await assert.rejects(
    revokeAppleForUser({ user: appleUser, authorizationCode: "c", clientId: "app.kunthai.mobile", config, fetchImpl }),
    (error) => error instanceof AppleRevokeError && error.code === "apple_account_mismatch",
  );
  assert.equal(calls.length, 1, "nothing is revoked after a mismatch");
});

test("missing config, unknown client, bad code and Apple failures are reported", async () => {
  const base = { user: appleUser, authorizationCode: "c", clientId: "app.kunthai.mobile" };
  const reject = (args, code) => assert.rejects(revokeAppleForUser(args), (error) => error.code === code);
  await reject({ ...base, config: null, fetchImpl: fakeApple().fetchImpl }, "apple_revoke_unconfigured");
  await reject({ ...base, config, clientId: "com.evil", fetchImpl: fakeApple().fetchImpl }, "invalid_client");
  await reject({ ...base, config, authorizationCode: " ", fetchImpl: fakeApple().fetchImpl }, "invalid_code");
  await reject({ ...base, config, fetchImpl: fakeApple({ tokenOk: false }).fetchImpl }, "apple_token_exchange_failed");
  await reject({ ...base, config, fetchImpl: fakeApple({ revokeOk: false }).fetchImpl }, "apple_revoke_failed");
});
