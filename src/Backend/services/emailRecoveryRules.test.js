import assert from "node:assert/strict";
import test from "node:test";

import {
  EMAIL_RECOVERY_WINDOW_MS,
  classifyRecoveryLinkError,
  isRecoveryFlagFresh,
  isValidRecoveryEmail,
  recoveryEmailStatus,
  sessionSignInMethods,
  shouldOfferRecoveryPassword,
} from "./emailRecoveryRules.js";

function token(claims) {
  const encode = (value) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${encode({ alg: "HS256" })}.${encode(claims)}.sig`;
}

test("email validation trims and lowercases", () => {
  assert.equal(isValidRecoveryEmail("  Ada@Example.com "), true);
  assert.equal(isValidRecoveryEmail("ada@example"), false);
  assert.equal(isValidRecoveryEmail(""), false);
});

test("recovery email status covers every stage", () => {
  assert.deepEqual(recoveryEmailStatus(null), { status: "none", email: "" });
  assert.deepEqual(recoveryEmailStatus({ user_metadata: {} }), { status: "none", email: "" });
  assert.deepEqual(
    recoveryEmailStatus({ user_metadata: { contact_email: "Ada@x.com" } }),
    { status: "unconfirmed", email: "ada@x.com" },
  );
  assert.deepEqual(
    recoveryEmailStatus({ new_email: "ada@x.com", user_metadata: { contact_email: "ada@x.com" } }),
    { status: "pending", email: "ada@x.com" },
  );
  assert.deepEqual(
    recoveryEmailStatus({ email: "ada@x.com", email_confirmed_at: "2026-10-06T00:00:00Z" }),
    { status: "verified", email: "ada@x.com" },
  );
  // A change waiting for confirmation wins over the old verified address.
  assert.equal(
    recoveryEmailStatus({ email: "old@x.com", email_confirmed_at: "2026-01-01", new_email: "new@x.com" }).status,
    "pending",
  );
});

test("unknown emails look like a sent link; rate limits and network do not", () => {
  assert.equal(classifyRecoveryLinkError(null), "sent");
  assert.equal(classifyRecoveryLinkError({ message: "Signups not allowed for otp", status: 422 }), "sent");
  assert.equal(classifyRecoveryLinkError({ code: "otp_disabled" }), "sent");
  assert.equal(classifyRecoveryLinkError({ status: 429, message: "x" }), "rate_limited");
  assert.equal(classifyRecoveryLinkError({ code: "over_email_send_rate_limit" }), "rate_limited");
  assert.equal(
    classifyRecoveryLinkError({ message: "For security purposes, you can only request this after 42 seconds." }),
    "rate_limited",
  );
  assert.equal(classifyRecoveryLinkError({ message: "Failed to fetch" }), "network");
});

test("recovery flag expires after the window", () => {
  const now = 1_000_000_000_000;
  assert.equal(isRecoveryFlagFresh({ email: "a@x.com", at: now - 1000 }, now), true);
  assert.equal(isRecoveryFlagFresh({ email: "a@x.com", at: now - EMAIL_RECOVERY_WINDOW_MS - 1 }, now), false);
  assert.equal(isRecoveryFlagFresh({ email: "a@x.com", at: now + 5000 }, now), false);
  assert.equal(isRecoveryFlagFresh(null, now), false);
});

test("session sign-in methods come from the amr claim", () => {
  assert.deepEqual(sessionSignInMethods(token({ amr: [{ method: "otp", timestamp: 1 }] })), ["otp"]);
  assert.deepEqual(sessionSignInMethods("not-a-token"), []);
});

test("password step opens only for the recovered account signed in by email", () => {
  const now = 1_000_000_000_000;
  const flag = { email: "ada@x.com", at: now - 60_000 };
  const user = { email: "Ada@x.com" };
  assert.equal(shouldOfferRecoveryPassword({ flag, user, accessToken: token({ amr: [{ method: "otp" }] }), now }), true);
  assert.equal(shouldOfferRecoveryPassword({ flag, user, accessToken: token({ amr: [{ method: "magiclink" }] }), now }), true);
  assert.equal(shouldOfferRecoveryPassword({ flag, user, accessToken: token({ amr: [{ method: "password" }] }), now }), false);
  assert.equal(shouldOfferRecoveryPassword({ flag, user: { email: "bob@x.com" }, accessToken: "", now }), false);
  assert.equal(shouldOfferRecoveryPassword({ flag: { ...flag, at: now - EMAIL_RECOVERY_WINDOW_MS - 1 }, user, accessToken: "", now }), false);
});
