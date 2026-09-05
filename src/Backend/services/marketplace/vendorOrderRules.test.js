import test from "node:test";
import assert from "node:assert/strict";

import {
  getProductMinimumOrderQuantity,
  normalizeProductOrderQuantity,
} from "./vendorOrderRules.js";

test("vendor order quantities respect the product minimum", () => {
  const product = { details: { minimumOrderQuantity: "12" } };
  assert.equal(getProductMinimumOrderQuantity(product), 12);
  assert.equal(normalizeProductOrderQuantity(product, 1), 12);
  assert.equal(normalizeProductOrderQuantity(product, 20), 20);
});

test("invalid or legacy minimum quantities safely fall back to one", () => {
  assert.equal(getProductMinimumOrderQuantity({}), 1);
  assert.equal(getProductMinimumOrderQuantity({ details: { minimumOrderQuantity: "invalid" } }), 1);
  assert.equal(normalizeProductOrderQuantity({}, "invalid"), 1);
});
