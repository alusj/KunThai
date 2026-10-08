import assert from "node:assert/strict";
import test from "node:test";

import { getTierUnitPrice, normalizeTierPricing } from "./tierPricingUtils.js";

const tiers = [
  { minQty: 10, maxQty: 49, price: 90 },
  { minQty: 50, maxQty: 0, price: 70 },
];

test("a bulk tier applies once its quantity is reached", () => {
  assert.equal(getTierUnitPrice(tiers, 5, 100), 100);
  assert.equal(getTierUnitPrice(tiers, 10, 100), 90);
  assert.equal(getTierUnitPrice(tiers, 60, 100), 70);
});

test("the discounted price wins when it is lower than the tier price", () => {
  assert.equal(getTierUnitPrice(tiers, 12, 80), 80);
  assert.equal(getTierUnitPrice(tiers, 60, 80), 70);
});

test("without a base price the tier price is used", () => {
  assert.equal(getTierUnitPrice(tiers, 12, 0), 90);
  assert.equal(getTierUnitPrice([], 3, 25), 25);
});

test("snake_case tiers and invalid rows are normalized", () => {
  assert.deepEqual(normalizeTierPricing([{ min_qty: "5", max_qty: "", price: "9" }, { minQty: 0, maxQty: 0, price: 3 }]), [
    { minQty: 5, maxQty: 0, price: 9 },
  ]);
});
