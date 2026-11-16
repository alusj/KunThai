import assert from "node:assert/strict";
import test from "node:test";

import { CALM_BUFFER_SECONDS, STALL_QUIET_MS, isStreamCalm, readBufferState } from "./swipStreamPriority.js";

const now = 1_800_000_000_000;

test("nothing streaming, or a clip played from the phone, never holds other work back", () => {
  assert.equal(isStreamCalm(null, now), true);
  assert.equal(isStreamCalm({ needsNetwork: false, bufferedAhead: 0, remaining: 30 }, now), true);
});

test("a clip that just started keeps the connection to itself", () => {
  assert.equal(isStreamCalm({ needsNetwork: true, bufferedAhead: 0, remaining: 30 }, now), false);
  assert.equal(isStreamCalm({ needsNetwork: true, bufferedAhead: CALM_BUFFER_SECONDS - 1, remaining: 30 }, now), false);
});

test("enough ahead, or buffered to the end, frees the connection", () => {
  assert.equal(isStreamCalm({ needsNetwork: true, bufferedAhead: CALM_BUFFER_SECONDS, remaining: 30 }, now), true);
  // A short clip: 6 s left and all of it buffered.
  assert.equal(isStreamCalm({ needsNetwork: true, bufferedAhead: 6, remaining: 6 }, now), true);
});

test("after the clip had to stop and load, other work waits a while", () => {
  const state = { needsNetwork: true, bufferedAhead: 20, remaining: 60, lastStallAt: now - 1000 };
  assert.equal(isStreamCalm(state, now), false);
  assert.equal(isStreamCalm({ ...state, lastStallAt: now - STALL_QUIET_MS - 1 }, now), true);
  // Fully buffered wins even right after a stall: nothing more to fetch.
  assert.equal(isStreamCalm({ ...state, bufferedAhead: 60 }, now), true);
});

test("buffer ahead is read from the range the playhead is in", () => {
  const video = {
    duration: 40,
    currentTime: 10,
    buffered: { length: 2, start: (i) => [0, 30][i], end: (i) => [18, 40][i] },
  };
  assert.deepEqual(readBufferState(video), { bufferedAhead: 8, remaining: 30 });
  assert.deepEqual(readBufferState({ duration: NaN, currentTime: 0, buffered: { length: 0 } }), { bufferedAhead: 0, remaining: NaN });
});
