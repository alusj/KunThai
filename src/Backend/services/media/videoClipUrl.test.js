import assert from "node:assert/strict";
import test from "node:test";

import { parseClipFragment, stripClipFragment, withClipFragment } from "./videoClipUrl.js";

const URL_BASE = "https://x.supabase.co/storage/v1/object/public/marketplace-business-media/u/products/videos/a.mp4";

test("a trim window round-trips through the stored URL", () => {
  const stored = withClipFragment(URL_BASE, 2.4, 11.8);
  assert.equal(stored, `${URL_BASE}#t=2.40,11.80`);
  assert.deepEqual(parseClipFragment(stored), { start: 2.4, end: 11.8 });
  assert.equal(stripClipFragment(stored), URL_BASE);
});

test("an untrimmed video keeps its plain URL", () => {
  assert.equal(withClipFragment(URL_BASE, 0, null), URL_BASE);
  assert.equal(withClipFragment(URL_BASE), URL_BASE);
  assert.equal(parseClipFragment(URL_BASE), null);
  assert.equal(stripClipFragment(URL_BASE), URL_BASE);
});

test("re-trimming replaces the old window instead of stacking", () => {
  const once = withClipFragment(URL_BASE, 1, 5);
  assert.equal(withClipFragment(once, 3, 9), `${URL_BASE}#t=3.00,9.00`);
});

test("an empty URL stays empty", () => {
  assert.equal(withClipFragment("", 1, 2), "");
  assert.equal(stripClipFragment(null), "");
});
