import assert from "node:assert/strict";
import { test } from "node:test";

import { hidePlaceholderEmail, isPlaceholderEmail, visibleEmail } from "./placeholderEmail.js";

test("only the placeholder domain counts", () => {
  assert.equal(isPlaceholderEmail("fb_123@kunthai.invalid"), true);
  assert.equal(isPlaceholderEmail(" FB_123@KunThai.Invalid "), true);
  assert.equal(isPlaceholderEmail("someone@gmail.com"), false);
  assert.equal(isPlaceholderEmail("kunthai.invalid@gmail.com"), false);
  assert.equal(isPlaceholderEmail(""), false);
  assert.equal(isPlaceholderEmail(null), false);
});

test("visibleEmail hides a placeholder and keeps a real address", () => {
  assert.equal(visibleEmail("fb_1@kunthai.invalid"), "");
  assert.equal(visibleEmail("a@b.co"), "a@b.co");
});

test("a placeholder user reads as an account with no email", () => {
  const user = hidePlaceholderEmail({
    id: "u1",
    email: "fb_1@kunthai.invalid",
    email_confirmed_at: "2026-11-11T00:00:00Z",
    user_metadata: { name: "A", email: "fb_1@kunthai.invalid" },
    identities: [
      { provider: "facebook", identity_data: {} },
      { provider: "email", identity_data: { email: "fb_1@kunthai.invalid" } },
    ],
  });
  assert.equal(user.email, "");
  assert.equal(user.email_confirmed_at, null);
  assert.equal(user.user_metadata.email, "");
  assert.deepEqual(user.identities.map((identity) => identity.provider), ["facebook"]);
});

test("a real email is left alone", () => {
  const user = hidePlaceholderEmail({ id: "u2", email: "a@b.co", email_confirmed_at: "x", identities: [{ provider: "email", identity_data: { email: "a@b.co" } }] });
  assert.equal(user.email, "a@b.co");
  assert.equal(user.email_confirmed_at, "x");
  assert.equal(user.identities.length, 1);
});
