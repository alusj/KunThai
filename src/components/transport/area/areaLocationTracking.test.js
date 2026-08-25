import assert from "node:assert/strict";
import test from "node:test";

import {
  getAreaLocationMotionDuration,
  isImplausibleAreaLocationJump,
  isPointOutsideSafeBox,
  normalizeBearing,
  shortestBearingDelta,
  shouldAcceptAreaLocationAccuracy,
  smoothBearing,
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

test("live movement fills the whole time between GPS fixes instead of teleporting early", () => {
  assert.equal(getAreaLocationMotionDuration(1_000, 8), 1_000);
  assert.equal(getAreaLocationMotionDuration(500, 18), 600);
});

test("live movement duration stays bounded after rapid or delayed GPS fixes", () => {
  assert.equal(getAreaLocationMotionDuration(100, 0.5), 360);
  assert.equal(getAreaLocationMotionDuration(12_000, 120), 1_400);
});

test("bearing smoothing takes the short way round when the heading crosses north", () => {
  // Turning from 350° to 010° is a 20° right turn, not a 340° left one.
  assert.equal(shortestBearingDelta(350, 10), 20);
  assert.equal(shortestBearingDelta(10, 350), -20);
  assert.equal(smoothBearing(350, 10, 0.5), 0);
});

test("the first heading is adopted outright, then eased toward later ones", () => {
  assert.equal(smoothBearing(null, 120, 0.4), 120);
  assert.equal(smoothBearing(100, 140, 0.5), 120);
  assert.equal(smoothBearing(100, null, 0.5), 100);
});

test("a bearing is always reported inside 0-360", () => {
  assert.equal(normalizeBearing(-90), 270);
  assert.equal(normalizeBearing(450), 90);
  assert.equal(normalizeBearing(null), null);
  assert.equal(smoothBearing(10, -10, 1), 350);
});

test("the traveller icon is only pulled back once it reaches the edge of the screen", () => {
  const viewport = { width: 400, height: 800 };
  // Centre and comfortably inside the safe box: leave the camera alone.
  assert.equal(isPointOutsideSafeBox({ x: 200, y: 400 }, viewport, 0.2), false);
  assert.equal(isPointOutsideSafeBox({ x: 120, y: 300 }, viewport, 0.2), false);
  // Past the 20% inset on any side, or off screen entirely: re-centre.
  assert.equal(isPointOutsideSafeBox({ x: 60, y: 400 }, viewport, 0.2), true);
  assert.equal(isPointOutsideSafeBox({ x: 200, y: 700 }, viewport, 0.2), true);
  assert.equal(isPointOutsideSafeBox({ x: -40, y: 400 }, viewport, 0.2), true);
  assert.equal(isPointOutsideSafeBox({ x: 200, y: 1200 }, viewport, 0.2), true);
});

test("a viewport that has not been measured yet never triggers a re-centre", () => {
  assert.equal(isPointOutsideSafeBox({ x: 0, y: 0 }, { width: 0, height: 0 }, 0.2), false);
  assert.equal(isPointOutsideSafeBox(null, { width: 400, height: 800 }, 0.2), false);
});
