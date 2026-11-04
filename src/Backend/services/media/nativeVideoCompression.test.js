import assert from "node:assert/strict";
import test from "node:test";

import { compressVideoForUpload, needsFaststartRewrite, shouldUseCompressedOutput } from "./nativeVideoCompression.js";

function box(type, payload) {
  const bytes = new Uint8Array(8 + payload);
  new DataView(bytes.buffer).setUint32(0, 8 + payload);
  for (let i = 0; i < 4; i += 1) bytes[4 + i] = type.charCodeAt(i);
  return bytes;
}

test("only faststart files may skip the phone's rewrite", async () => {
  const faststart = new Blob([box("ftyp", 20), box("moov", 100), box("mdat", 1000)]);
  const fragmented = new Blob([box("ftyp", 20), box("moov", 100), box("moof", 50), box("mdat", 1000)]);
  const moovAtEnd = new Blob([box("ftyp", 20), box("mdat", 1000), box("moov", 100)]);
  assert.equal(await needsFaststartRewrite(faststart), false);
  assert.equal(await needsFaststartRewrite(fragmented), true);
  assert.equal(await needsFaststartRewrite(moovAtEnd), true);
  assert.equal(await needsFaststartRewrite(new Blob([new Uint8Array([1, 2, 3])])), true);
});

test("a rewritten (forced) output is kept even when a little bigger than the original", () => {
  assert.equal(shouldUseCompressedOutput({ outputBytes: 7_000_000, originalBytes: 6_000_000, trimmed: false, forced: true }), true);
  assert.equal(shouldUseCompressedOutput({ outputBytes: 7_000_000, originalBytes: 6_000_000, trimmed: false, forced: false }), false);
  assert.equal(shouldUseCompressedOutput({ outputBytes: 5_000_000, originalBytes: 6_000_000, trimmed: false, forced: false }), true);
  assert.equal(shouldUseCompressedOutput({ outputBytes: 9_000_000, originalBytes: 6_000_000, trimmed: true, forced: false }), true);
});

test("an output over the upload limit or empty is never used", () => {
  assert.equal(shouldUseCompressedOutput({ outputBytes: 0, originalBytes: 6_000_000, trimmed: true, forced: true }), false);
  assert.equal(shouldUseCompressedOutput({ outputBytes: 60_000_000, originalBytes: 200_000_000, trimmed: true, forced: true, maxBytes: 50_000_000 }), false);
});

test("outside the app the original is returned untouched", async () => {
  const file = new Blob([box("ftyp", 20), box("moov", 100), box("moof", 50)]);
  const result = await compressVideoForUpload(file, { trimStart: 1, trimEnd: 5 });
  assert.equal(result.file, file);
  assert.equal(result.compressed, false);
});
