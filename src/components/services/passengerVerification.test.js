import assert from "node:assert/strict";
import test from "node:test";

import { passengerVerificationStatus } from "./passengerVerification.js";

test("an operator is verified for passengers only when the fleet is verified too", () => {
  assert.equal(passengerVerificationStatus("verified", "verified_recommended"), "verified_recommended");
  assert.equal(passengerVerificationStatus("verified", "verified"), "verified");
});

test("one of the two verified reads as verification pending", () => {
  assert.equal(passengerVerificationStatus("verified", "verification_pending"), "verification_pending");
  assert.equal(passengerVerificationStatus("pending_review", "verified_recommended"), "verification_pending");
  assert.equal(passengerVerificationStatus("verified", "not_verified"), "verification_pending");
  assert.equal(passengerVerificationStatus("verified", ""), "verification_pending");
});

test("neither verified keeps the fleet's own status", () => {
  assert.equal(passengerVerificationStatus("not_verified", "verification_pending"), "not_verified");
  assert.equal(passengerVerificationStatus("", "not_verified"), "not_verified");
  assert.equal(passengerVerificationStatus("", ""), "verification_pending");
});
