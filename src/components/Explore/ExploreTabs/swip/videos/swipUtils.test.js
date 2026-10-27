import assert from "node:assert/strict";
import test from "node:test";

import { getKnownSwipVideoFit, getSwipVideoFit, rememberSwipVideoSize } from "./swipUtils.js";

test("phone-format clips fill the screen", () => {
  assert.equal(getSwipVideoFit(1080, 1920), "fill");
  assert.equal(getSwipVideoFit(1080, 2340), "fill");
});

test("TV-format, square and 3:4 clips fit whole", () => {
  assert.equal(getSwipVideoFit(1920, 1080), "fit");
  assert.equal(getSwipVideoFit(1080, 1080), "fit");
  assert.equal(getSwipVideoFit(1080, 1440), "fit");
});

test("unknown sizes give no fit yet", () => {
  assert.equal(getSwipVideoFit(0, 0), "");
  assert.equal(getSwipVideoFit(undefined, 1080), "");
});

test("known fit comes from stored size, then from a size seen on this device", () => {
  assert.equal(getKnownSwipVideoFit({ id: "a", media_meta: { width: 1280, height: 720 } }), "fit");
  assert.equal(getKnownSwipVideoFit({ id: "b" }), "");
  rememberSwipVideoSize("b", 720, 1280);
  assert.equal(getKnownSwipVideoFit({ id: "b" }), "fill");
});
