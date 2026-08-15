import assert from "node:assert/strict";
import test from "node:test";

import {
  acquireGestureLock,
  canStartNavigationGesture,
  classifyBackSwipe,
  navigationGesturesLocked,
  resetGestureArbitrationForTests,
} from "./gestureArbitration.js";

test("back swipe requires a primarily horizontal rightward gesture", () => {
  assert.equal(classifyBackSwipe({ deltaX: 80, deltaY: 18, elapsedMs: 260 }).commit, true);
  assert.equal(classifyBackSwipe({ deltaX: -90, deltaY: 5, elapsedMs: 120 }).commit, false);
  assert.equal(classifyBackSwipe({ deltaX: 70, deltaY: 90, elapsedMs: 180 }).commit, false);
  assert.equal(classifyBackSwipe({ deltaX: 20, deltaY: 2, elapsedMs: 400 }).commit, false);
});

test("a short fast fling can commit without allowing vertical scroll to navigate", () => {
  assert.equal(classifyBackSwipe({ deltaX: 36, deltaY: 6, elapsedMs: 45 }).commit, true);
  assert.equal(classifyBackSwipe({ deltaX: 36, deltaY: 34, elapsedMs: 45 }).commit, false);
});

test("gesture-owned targets and active locks block navigation recognition", () => {
  resetGestureArbitrationForTests();
  const lockedTarget = { closest: () => ({ dataset: { gestureLock: "viewer" } }) };
  assert.equal(canStartNavigationGesture(lockedTarget, { allowInActiveLayer: true }), false);

  const release = acquireGestureLock("product-viewer");
  assert.equal(navigationGesturesLocked(), true);
  release({ suppressMs: 0 });
  assert.equal(navigationGesturesLocked(), false);
  resetGestureArbitrationForTests();
});
