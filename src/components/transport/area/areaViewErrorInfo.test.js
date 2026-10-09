import assert from "node:assert/strict";
import test from "node:test";

import { AREA_VIEW_LAST_ERROR_KEY, describeAreaViewError, rememberAreaViewError } from "./areaViewErrorInfo.js";

test("error details are one short line with the error name", () => {
  assert.equal(
    describeAreaViewError(new TypeError("null is not an object\n (evaluating 'a.label')")),
    "TypeError: null is not an object (evaluating 'a.label')",
  );
  assert.equal(describeAreaViewError(null), "Error");
  const long = describeAreaViewError(new Error("x".repeat(400)));
  assert.equal(long.length, 160);
  assert.ok(long.endsWith("…"));
});

test("the last error is kept with a timestamp, and blocked storage is harmless", () => {
  const saved = new Map();
  const storage = { setItem: (key, value) => saved.set(key, value) };
  assert.equal(rememberAreaViewError(new RangeError("bad"), 2, storage), true);
  const entry = JSON.parse(saved.get(AREA_VIEW_LAST_ERROR_KEY));
  assert.equal(AREA_VIEW_LAST_ERROR_KEY, "kt-area-view-last-error");
  assert.equal(entry.name, "RangeError");
  assert.equal(entry.message, "bad");
  assert.equal(entry.failures, 2);
  assert.ok(Number.isFinite(entry.timestamp) && entry.at);
  assert.equal(rememberAreaViewError(new Error("x"), 1, { setItem() { throw new Error("blocked"); } }), false);
});
