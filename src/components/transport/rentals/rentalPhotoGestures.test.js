import assert from "node:assert/strict";
import test from "node:test";
import { clampPhotoPan, photoPanBounds, photoSwipeAction } from "./rentalPhotoGestures.js";

test("horizontal swipes navigate and downward swipes dismiss without treating taps as swipes", () => {
  assert.equal(photoSwipeAction(-110, 10), "next");
  assert.equal(photoSwipeAction(110, 10), "previous");
  assert.equal(photoSwipeAction(10, 120), "close");
  assert.equal(photoSwipeAction(10, -120), null);
  assert.equal(photoSwipeAction(5, 5), null);
  assert.equal(photoSwipeAction(100, 100), null);
});
test("zoomed portrait and landscape photos pan within their fitted image bounds", () => {
  assert.deepEqual(photoPanBounds({ width: 400, height: 600 }, { width: 1200, height: 600 }, 2.5), { x: 300, y: 0 });
  assert.deepEqual(photoPanBounds({ width: 400, height: 600 }, { width: 400, height: 1200 }, 2.5), { x: 50, y: 450 });
  assert.deepEqual(clampPhotoPan({ x: 800, y: -900 }, { x: 50, y: 450 }), { x: 50, y: -450 });
  assert.deepEqual(photoPanBounds({ width: 400, height: 600 }, { width: 0, height: 0 }, 2.5), { x: 0, y: 0 });
});
