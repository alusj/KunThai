import assert from "node:assert/strict";
import test from "node:test";

import { hasUsableReturningProfile } from "./returningProfileRules.js";

test("missing records (null) are simply not a returning profile", () => {
  assert.equal(hasUsableReturningProfile(null), false);
  assert.equal(hasUsableReturningProfile(undefined), false);
});

test("a stored profile with a real name counts as returning", () => {
  assert.equal(hasUsableReturningProfile({ display_name: "Alhussine" }), true);
  assert.equal(hasUsableReturningProfile({ business_name: "Shop" }), true);
});

test("placeholder names do not count", () => {
  assert.equal(hasUsableReturningProfile({ display_name: "Profile", username: "user" }), false);
});
