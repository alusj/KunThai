import assert from "node:assert/strict";
import test from "node:test";

import { originalOfSmallCopy, smallCopySize, smallCopyTarget, smallCopyUrl } from "./smallImageCopyModel.js";

const HOST = "https://abc.supabase.co/storage/v1/object/public";
const PRODUCT = `${HOST}/marketplace-business-media/u1/products/covers/1-a.jpg`;

test("a list-sized photo uses its small copy; a large one keeps the original", () => {
  assert.equal(smallCopyUrl(PRODUCT, 480), `${PRODUCT}.sm.jpg`);
  assert.equal(smallCopyUrl(PRODUCT, 96), `${PRODUCT}.sm.jpg`);
  assert.equal(smallCopyUrl(PRODUCT, 720), PRODUCT);
  assert.equal(smallCopyUrl(PRODUCT, undefined), PRODUCT);
});

test("only public photos in the three media buckets have small copies", () => {
  assert.equal(smallCopyUrl(`${HOST}/transport-verification-documents/u1/id.jpg`, 96), `${HOST}/transport-verification-documents/u1/id.jpg`);
  assert.equal(smallCopyUrl(`${HOST}/explore-media/u1/video-1.mp4`, 96), `${HOST}/explore-media/u1/video-1.mp4`);
  assert.equal(smallCopyUrl("data:image/png;base64,AAAA", 96), "data:image/png;base64,AAAA");
  assert.equal(smallCopyUrl("https://lh3.googleusercontent.com/a/x", 96), "https://lh3.googleusercontent.com/a/x");
  assert.equal(smallCopyUrl(`${PRODUCT}.sm.jpg`, 96), `${PRODUCT}.sm.jpg`);
  assert.deepEqual(smallCopyTarget(`${HOST}/explore-media/u1/image-2.PNG?v=3`), { bucket: "explore-media", path: "u1/image-2.PNG" });
});

test("a small copy that failed once is not asked for again", () => {
  assert.equal(smallCopyUrl(PRODUCT, 96, new Set([PRODUCT])), PRODUCT);
});

test("a small copy maps back to its original", () => {
  assert.equal(originalOfSmallCopy(`${PRODUCT}.sm.jpg`), PRODUCT);
  assert.equal(originalOfSmallCopy(PRODUCT), "");
});

test("small copies keep the whole frame, 640 px wide", () => {
  assert.deepEqual(smallCopySize(900, 1600), { width: 640, height: 1138 });
  assert.deepEqual(smallCopySize(2532, 1170), { width: 640, height: 296 });
  assert.deepEqual(smallCopySize(400, 300), { width: 400, height: 300 });
});
