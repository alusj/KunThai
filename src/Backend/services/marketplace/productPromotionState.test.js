import assert from "node:assert/strict";
import test from "node:test";

import { isPromotionLive, liveProductPromotionMap, productHasLivePromotion } from "./productPromotionState.js";

const NOW = Date.parse("2026-10-08T12:00:00Z");

test("a boost is live only while it is active and has not ended", () => {
  assert.equal(isPromotionLive({ status: "active", ends_at: "2026-10-09T00:00:00Z" }, NOW), true);
  assert.equal(isPromotionLive({ status: "active", ends_at: "2026-10-08T11:59:00Z" }, NOW), false);
  assert.equal(isPromotionLive({ status: "paused", ends_at: "2026-10-09T00:00:00Z" }, NOW), false);
  assert.equal(isPromotionLive({ status: "active", ends_at: null }, NOW), true);
  assert.equal(isPromotionLive(null, NOW), false);
});

test("the stale promoted flag does not count once the boost has ended", () => {
  assert.equal(productHasLivePromotion({ promoted: true, livePromotion: null }, NOW), false);
  assert.equal(productHasLivePromotion({ promoted: true, livePromotion: { endsAt: "2026-10-08T10:00:00Z" } }, NOW), false);
  assert.equal(productHasLivePromotion({ promoted: false, livePromotion: { endsAt: "2026-10-10T10:00:00Z" } }, NOW), true);
  // Unknown (promotions could not be read): fall back to the flag.
  assert.equal(productHasLivePromotion({ promoted: true }, NOW), true);
});

test("live promotions are mapped per product", () => {
  const map = liveProductPromotionMap([
    { id: "a", product_id: "p1", status: "active", ends_at: "2026-10-09T00:00:00Z" },
    { id: "b", product_id: "p1", status: "active", ends_at: "2026-10-12T00:00:00Z" },
    { id: "c", product_id: "p2", status: "active", ends_at: "2026-10-01T00:00:00Z" },
  ], NOW);
  assert.deepEqual(map.get("p1"), { id: "b", endsAt: "2026-10-12T00:00:00Z" });
  assert.equal(map.has("p2"), false);
});
