import assert from "node:assert/strict";
import test from "node:test";

import { beginHeavyUpload, isHeavyUploadActive } from "./uploadActivity.js";

test("tracks overlapping uploads and ignores a second end call", () => {
  assert.equal(isHeavyUploadActive(), false);
  const endFirst = beginHeavyUpload();
  const endSecond = beginHeavyUpload();
  assert.equal(isHeavyUploadActive(), true);
  endFirst();
  endFirst();
  assert.equal(isHeavyUploadActive(), true, "the second upload is still running");
  endSecond();
  assert.equal(isHeavyUploadActive(), false);
});
