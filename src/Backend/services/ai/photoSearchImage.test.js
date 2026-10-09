import assert from "node:assert/strict";
import test from "node:test";

import { dataUrlBytes, fitDimensions, PHOTO_SEARCH_MAX_BYTES, preparePhotoForSearch } from "./photoSearchImage.js";

test("large phone photos are scaled to the long side and never upscaled", () => {
  assert.deepEqual(fitDimensions(4032, 3024, 768), { width: 768, height: 576 });
  assert.deepEqual(fitDimensions(3024, 4032, 768), { width: 576, height: 768 });
  assert.deepEqual(fitDimensions(300, 200, 768), { width: 300, height: 200 });
  assert.deepEqual(fitDimensions(0, 0, 768), { width: 1, height: 1 });
});

test("the encoded size is measured on the decoded bytes and stays under the server limit", () => {
  assert.equal(dataUrlBytes("data:image/jpeg;base64,QUJD"), 3);
  assert.equal(dataUrlBytes("data:image/jpeg;base64,QUI="), 2);
  assert.equal(dataUrlBytes(""), 0);
  // server/ai/aiConfig.js accepts images up to 420,000 bytes.
  assert.ok(PHOTO_SEARCH_MAX_BYTES < 420_000);
});

test("without a browser the photo is reported as not prepared", async () => {
  assert.deepEqual(await preparePhotoForSearch(null), { error: "failed" });
});
