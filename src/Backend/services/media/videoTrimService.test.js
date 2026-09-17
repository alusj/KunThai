import assert from "node:assert/strict";
import test from "node:test";

import { canTrimVideos, describeTrimSupport, formatVideoMb, pickRecorderMimeType, trimmedFileName } from "./videoTrimService.js";

// The browser paths are exercised in the app; these cover the decisions that
// must hold everywhere, including the engines that cannot trim at all.

test("a browser without MediaRecorder reports no trim support instead of failing later", () => {
  assert.deepEqual(describeTrimSupport(), { strategy: "none", reason: "no-media-recorder" });
  assert.equal(canTrimVideos(), false);
  assert.equal(pickRecorderMimeType(), "");
});

test("iOS-style engines (MediaRecorder, no element capture) fall back to the canvas path", (t) => {
  t.after(() => {
    delete globalThis.MediaRecorder;
    delete globalThis.HTMLVideoElement;
    delete globalThis.HTMLCanvasElement;
  });
  globalThis.MediaRecorder = class {
    static isTypeSupported(type) {
      return type === "video/mp4";
    }
  };
  // Safari and the iOS WKWebView expose neither captureStream nor mozCaptureStream.
  globalThis.HTMLVideoElement = class {};
  globalThis.HTMLCanvasElement = class {
    captureStream() {}
  };

  assert.deepEqual(describeTrimSupport(), { strategy: "canvas", reason: "" });
  assert.equal(canTrimVideos(), true);
  assert.equal(pickRecorderMimeType(), "video/mp4");
});

test("an engine with element capture prefers it", (t) => {
  t.after(() => {
    delete globalThis.MediaRecorder;
    delete globalThis.HTMLVideoElement;
    delete globalThis.HTMLCanvasElement;
  });
  globalThis.MediaRecorder = class {
    static isTypeSupported() {
      return true;
    }
  };
  globalThis.HTMLVideoElement = class {
    captureStream() {}
  };
  globalThis.HTMLCanvasElement = class {
    captureStream() {}
  };

  assert.equal(describeTrimSupport().strategy, "element");
  assert.equal(pickRecorderMimeType(), "video/mp4;codecs=avc1,mp4a.40.2", "mp4 is preferred so the clip plays everywhere");
});

test("a browser with no capture at all is reported, not guessed at", (t) => {
  t.after(() => {
    delete globalThis.MediaRecorder;
    delete globalThis.HTMLVideoElement;
    delete globalThis.HTMLCanvasElement;
  });
  globalThis.MediaRecorder = class {
    static isTypeSupported() {
      return false;
    }
  };
  globalThis.HTMLVideoElement = class {};
  globalThis.HTMLCanvasElement = class {};
  assert.deepEqual(describeTrimSupport(), { strategy: "none", reason: "no-capture-stream" });
});

test("trimmed clips keep their name and take the container's extension", () => {
  assert.equal(trimmedFileName("IMG_0421.MOV", "video/mp4;codecs=avc1"), "IMG_0421-trimmed.mp4");
  assert.equal(trimmedFileName("clip.webm", "video/webm"), "clip-trimmed.webm");
  assert.equal(trimmedFileName("", ""), "kunthai-video-trimmed.webm");
});

test("sizes read the way people expect", () => {
  assert.equal(formatVideoMb(1.5 * 1024 * 1024), "1.5");
  assert.equal(formatVideoMb(48 * 1024 * 1024), "48");
  assert.equal(formatVideoMb(0), "0.0");
});
