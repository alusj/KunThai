import assert from "node:assert/strict";
import test from "node:test";

// A video element: `fixedVolume` behaves like iOS, where writes to volume are ignored.
function fakeVideo({ fixedVolume = false, volume = 1 } = {}) {
  let current = volume;
  return {
    tagName: "VIDEO",
    paused: false,
    ended: false,
    muted: false,
    isConnected: true,
    dataset: {},
    get volume() {
      return current;
    },
    set volume(value) {
      if (!fixedVolume) current = value;
    },
    pause() {
      this.paused = true;
    },
    play() {
      this.paused = false;
      return Promise.resolve();
    },
  };
}

let videos = [];
globalThis.document = { querySelectorAll: () => videos };
globalThis.window = { setInterval: () => 1, clearInterval: () => {} };

const { duckExploreVideos } = await import("./singleMediaPlayback.js");

test("playing a voice comment drops the video to 5% and brings it back", () => {
  const video = fakeVideo({ volume: 0.8 });
  videos = [video];
  const release = duckExploreVideos("voice-a", "playback");
  assert.equal(video.volume, 0.05);
  assert.equal(video.paused, false);
  release();
  assert.equal(video.volume, 0.8);
});

test("recording silences the video, then restores it", () => {
  const video = fakeVideo({ volume: 0.7 });
  videos = [video];
  const release = duckExploreVideos("mic", "recording");
  assert.equal(video.muted, true);
  assert.equal(video.paused, false);
  release();
  assert.equal(video.muted, false);
  assert.equal(video.volume, 0.7);
});

test("recording during a playing voice comment: silenced, then back to 5%, then back to full", () => {
  const video = fakeVideo({ volume: 1 });
  videos = [video];
  const releasePlayback = duckExploreVideos("voice-b", "playback");
  const releaseRecording = duckExploreVideos("mic-b", "recording");
  assert.equal(video.muted, true);
  releaseRecording();
  assert.equal(video.muted, false);
  assert.equal(video.volume, 0.05);
  releasePlayback();
  assert.equal(video.volume, 1);
});

test("where the volume is fixed (iOS), a voice comment pauses the video and resumes it", () => {
  const video = fakeVideo({ fixedVolume: true });
  videos = [video];
  const release = duckExploreVideos("voice-c", "playback");
  assert.equal(video.paused, true);
  release();
  assert.equal(video.paused, false);
});

test("where the volume is fixed (iOS), recording mutes rather than pauses", () => {
  const video = fakeVideo({ fixedVolume: true });
  videos = [video];
  const release = duckExploreVideos("mic-c", "recording");
  assert.equal(video.paused, false);
  assert.equal(video.muted, true);
  release();
  assert.equal(video.muted, false);
});
