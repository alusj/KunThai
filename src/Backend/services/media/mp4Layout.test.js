import assert from "node:assert/strict";
import test from "node:test";

import { classifyTopLevelBoxes, isFaststartMp4, parseBoxHeader, readMp4Layout } from "./mp4Layout.js";

// Builds a file from top-level boxes: [type, payloadBytes] pairs.
function mp4(...boxes) {
  const parts = boxes.map(([type, payload = 8, { large = false } = {}]) => {
    const header = large ? 16 : 8;
    const bytes = new Uint8Array(header + payload);
    const view = new DataView(bytes.buffer);
    if (large) {
      view.setUint32(0, 1);
      view.setBigUint64(8, BigInt(header + payload));
    } else {
      view.setUint32(0, header + payload);
    }
    for (let i = 0; i < 4; i += 1) bytes[4 + i] = type.charCodeAt(i);
    return bytes;
  });
  return new Blob(parts, { type: "video/mp4" });
}

test("a faststart MP4 (moov before mdat) is recognised", async () => {
  const file = mp4(["ftyp", 20], ["moov", 900], ["mdat", 5000]);
  assert.deepEqual(await readMp4Layout(file), { layout: "faststart", boxes: ["ftyp", "moov", "mdat"] });
  assert.equal(await isFaststartMp4(file), true);
});

test("MediaRecorder output (ftyp, moov, moof/mdat…) is fragmented", async () => {
  const file = mp4(["ftyp", 20], ["moov", 1100], ["moof", 600], ["mdat", 4000], ["moof", 600], ["mdat", 4000]);
  const result = await readMp4Layout(file);
  assert.equal(result.layout, "fragmented");
  assert.deepEqual(result.boxes, ["ftyp", "moov", "moof"]);
  assert.equal(await isFaststartMp4(file), false);
});

test("a camera file with the index at the end is not faststart", async () => {
  assert.equal((await readMp4Layout(mp4(["ftyp", 20], ["wide", 0], ["mdat", 9000], ["moov", 900]))).layout, "moov-at-end");
});

test("a 64-bit mdat size is followed correctly", async () => {
  const file = mp4(["ftyp", 20], ["mdat", 3000, { large: true }], ["moov", 500]);
  assert.equal((await readMp4Layout(file)).layout, "moov-at-end");
});

test("WebM, empty, and cut-short files are unknown, never faststart", async () => {
  const webm = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 1, 0, 0, 0])], { type: "video/webm" });
  assert.equal((await readMp4Layout(webm)).layout, "unknown");
  assert.equal((await readMp4Layout(new Blob([]))).layout, "unknown");
  assert.equal((await readMp4Layout(null)).layout, "unknown");
  // ftyp only: the upload was cut off before any index.
  assert.equal((await readMp4Layout(mp4(["ftyp", 20]))).layout, "unknown");
  assert.equal(await isFaststartMp4(webm), false);
});

test("box list classification", () => {
  assert.equal(classifyTopLevelBoxes(["ftyp", "moov", "mdat"]), "faststart");
  assert.equal(classifyTopLevelBoxes(["ftyp", "moov", "free", "mdat"]), "faststart");
  assert.equal(classifyTopLevelBoxes(["ftyp", "moov", "moof"]), "fragmented");
  assert.equal(classifyTopLevelBoxes(["ftyp", "mdat", "moov"]), "moov-at-end");
  assert.equal(classifyTopLevelBoxes(["ftyp", "mdat"]), "moov-at-end");
  assert.equal(classifyTopLevelBoxes(["ftyp"]), "unknown");
  assert.equal(classifyTopLevelBoxes(), "unknown");
});

test("headers that are not plausible boxes are rejected", () => {
  assert.equal(parseBoxHeader(new Uint8Array([0, 0, 0, 4, 0x66, 0x74, 0x79, 0x70]), 0, 100), null);
  assert.equal(parseBoxHeader(new Uint8Array([0, 0, 0, 16, 0, 1, 2, 3]), 0, 100), null);
  assert.deepEqual(parseBoxHeader(new Uint8Array([0, 0, 0, 0, 0x6d, 0x64, 0x61, 0x74]), 40, 100), { type: "mdat", size: 60 });
});
