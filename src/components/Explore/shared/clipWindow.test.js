import assert from "node:assert/strict";
import test from "node:test";

import { clipWindow, postClipRange } from "./clipWindow.js";

test("a stored window is kept when it fits", () => {
  assert.deepEqual(clipWindow(40, 52, 120), { start: 40, end: 52 });
});

test("the window never runs past the video or the 15 s limit", () => {
  assert.deepEqual(clipWindow(110, 140, 118), { start: 110, end: 118 });
  assert.deepEqual(clipWindow(10, 60, 120), { start: 10, end: 25 });
  assert.deepEqual(clipWindow(0, null, 9), { start: 0, end: 9 });
});

test("unknown duration still gives a playable window", () => {
  assert.deepEqual(clipWindow(5, 12, 0), { start: 5, end: 12 });
  assert.deepEqual(clipWindow(undefined, undefined, 0), { start: 0, end: 15 });
});

test("the post's trim fields are read from every shape", () => {
  assert.deepEqual(postClipRange({ video_trim_start: 3, video_trim_end: 9 }), { start: 3, end: 9 });
  assert.deepEqual(postClipRange({ media_meta: { videoTrimStart: 4, videoTrimEnd: 10 } }), { start: 4, end: 10 });
  assert.deepEqual(postClipRange({}), { start: 0, end: null });
});
