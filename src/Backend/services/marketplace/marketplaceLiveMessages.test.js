import assert from "node:assert/strict";
import test from "node:test";

import { addDeliveredMessage, marketplaceMessageFromRow } from "./marketplaceLiveMessages.js";

const sellerRow = { id: "m1", sender_role: "seller", preview: "Hello", created_at: "2026-11-10T10:00:00Z", business_id: "b1" };

test("a delivered row becomes a thread message", () => {
  const message = marketplaceMessageFromRow(sellerRow);
  assert.equal(message.id, "m1");
  assert.equal(message.from, "seller");
  assert.equal(message.text, "Hello");
  assert.equal(message.mediaType, "text");
});

test("the other side's message is added once; my own is not", () => {
  const once = addDeliveredMessage([], "c1", sellerRow, "buyer");
  assert.equal(once.length, 1);
  assert.equal(once[0].conversationId, "c1");
  assert.equal(addDeliveredMessage(once, "c1", sellerRow, "buyer"), once);
  assert.deepEqual(addDeliveredMessage([], "c1", { ...sellerRow, sender_role: "buyer" }, "buyer"), []);
  assert.deepEqual(addDeliveredMessage([], "", sellerRow, "buyer"), []);
});
