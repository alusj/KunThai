import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  amountToMinor,
  createFlutterwaveReference,
  createPayloadHash,
  formatMinorAmount,
  verifyFlutterwaveWebhookSignature,
} from "./flutterwaveVisibilityCredits.js";

test("formats and restores ISO currency minor units without floating point drift", () => {
  assert.equal(formatMinorAmount(99, "USD"), "0.99");
  assert.equal(formatMinorAmount(12000, "SLE"), "120.00");
  assert.equal(formatMinorAmount(500, "JPY"), "500");
  assert.equal(formatMinorAmount(1234, "KWD"), "1.234");
  assert.equal(amountToMinor("0.99", "USD"), 99n);
  assert.equal(amountToMinor("1.234", "KWD"), 1234n);
  assert.equal(amountToMinor("0.999", "USD"), null);
});

test("creates a deterministic Flutterwave payload checksum", () => {
  assert.equal(
    createPayloadHash({
      amount: "0.99",
      currency: "USD",
      email: "buyer@example.com",
      secretKey: "FLWSECK_TEST-example",
      txRef: "kt-vc-test",
    }),
    "35c6d8e8660cab099627e069b059254d0ce935ef3c8b0432e3e6b3134df9382e",
  );
});

test("accepts current HMAC webhooks and v3 legacy secret-hash webhooks", () => {
  const rawBody = Buffer.from('{"type":"charge.completed"}');
  const secret = "test-webhook-secret";
  const signature = createHmac("sha256", secret).update(rawBody).digest("base64");

  assert.equal(verifyFlutterwaveWebhookSignature(rawBody, { "flutterwave-signature": signature }, secret), true);
  assert.equal(verifyFlutterwaveWebhookSignature(rawBody, { "verif-hash": secret }, secret), true);
  assert.equal(verifyFlutterwaveWebhookSignature(rawBody, { "flutterwave-signature": "invalid" }, secret), false);
});

test("purchase references are namespaced and include the purchase UUID", () => {
  const purchaseId = "4d9cb0a3-1778-46df-a350-d1c217fb91f6";
  assert.equal(createFlutterwaveReference(purchaseId), `kt-vc-${purchaseId}`);
});
