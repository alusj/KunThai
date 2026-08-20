import assert from "node:assert/strict";
import test from "node:test";

import {
  isImplausibleAreaLocationJump,
  shouldAcceptAreaLocationAccuracy,
} from "./areaLocationTracking.js";

test("the first live GPS fix is never rejected as a jump from a fallback marker", () => {
  assert.equal(
    isImplausibleAreaLocationJump(
      { lat: 8.4657, lng: -13.2317, accuracy: 0 },
      { lat: 8.4901, lng: -13.2103, accuracy: 24 },
      { hasLiveFix: false, elapsedMs: 500 },
    ),
    false,
  );
});

test("an impossible jump between established precise fixes is rejected", () => {
  assert.equal(
    isImplausibleAreaLocationJump(
      { lat: 8.4657, lng: -13.2317, accuracy: 12 },
      { lat: 8.4901, lng: -13.2103, accuracy: 18 },
      { hasLiveFix: true, elapsedMs: 1_000 },
    ),
    true,
  );
});

test("a quick coarse fix is accepted initially but not during established tracking", () => {
  assert.equal(shouldAcceptAreaLocationAccuracy(1_200, { hasLiveFix: false }), true);
  assert.equal(shouldAcceptAreaLocationAccuracy(1_200, { hasLiveFix: true }), false);
  assert.equal(shouldAcceptAreaLocationAccuracy(80, { hasLiveFix: true }), true);
});

test("GPS uncertainty does not turn a legitimate accuracy refinement into a jump", () => {
  assert.equal(
    isImplausibleAreaLocationJump(
      { lat: 8.4657, lng: -13.2317, accuracy: 1_500 },
      { lat: 8.4702, lng: -13.2273, accuracy: 35 },
      { hasLiveFix: true, elapsedMs: 1_000 },
    ),
    false,
  );
});
