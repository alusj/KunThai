import assert from "node:assert/strict";
import test from "node:test";

import {
  AVAILABILITY_REFRESH_GRACE_MS,
  resolveFleetAvailability,
  shouldPreserveAvailabilityOverride,
} from "../../components/transport/operatorAvailabilityState.js";

test("a successful availability request keeps its requested state when the server returns no row", () => {
  assert.equal(resolveFleetAvailability(null, true), true);
  assert.equal(resolveFleetAvailability(undefined, false), false);
});

test("an explicit fleet status wins when the server returns a complete row", () => {
  assert.equal(resolveFleetAvailability({ active_status: "active" }, false), true);
  assert.equal(resolveFleetAvailability({ activeStatus: "offline" }, true), false);
});

test("a stale dashboard refresh cannot immediately undo a confirmed toggle", () => {
  const now = 10_000;
  const override = { active: false, expiresAt: now + AVAILABILITY_REFRESH_GRACE_MS };
  assert.equal(shouldPreserveAvailabilityOverride(override, true, now), true);
  assert.equal(shouldPreserveAvailabilityOverride(override, false, now), false);
  assert.equal(shouldPreserveAvailabilityOverride(override, true, override.expiresAt + 1), false);
});
