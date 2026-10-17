import assert from "node:assert/strict";
import test from "node:test";

import {
  FINISH_WAIT_MS,
  FIRST_VERIFY_AFTER_MS,
  UPLOAD_STALL_MS,
  VERIFY_EVERY_MS,
  directUploadWatchdogAction,
  isStoredObjectResponse,
} from "./uploadWatchdog.js";

const T = 1_000_000;

test("while bytes are still going out, 40 s of silence is a stall", () => {
  assert.equal(directUploadWatchdogAction({ now: T, lastProgressAt: T - 10_000 }), "wait");
  assert.equal(directUploadWatchdogAction({ now: T, lastProgressAt: T - UPLOAD_STALL_MS }), "stall");
});

test("once every byte is sent, silence is not a stall: storage is asked instead (the advert 56% hang)", () => {
  const sent = T - 60_000; // iPhone: all bytes reported a minute ago, no answer yet
  // The old rule would have stopped this upload; now it checks storage.
  assert.equal(directUploadWatchdogAction({ now: T, lastProgressAt: sent, allSentAt: sent }), "verify");
  // Not straight away: the server's own answer gets a moment first.
  assert.equal(directUploadWatchdogAction({ now: T, lastProgressAt: T, allSentAt: T - (FIRST_VERIFY_AFTER_MS - 1) }), "wait");
  // One check at a time, and not more often than every few seconds.
  assert.equal(directUploadWatchdogAction({ now: T, lastProgressAt: sent, allSentAt: sent, verifying: true }), "wait");
  assert.equal(directUploadWatchdogAction({ now: T, lastProgressAt: sent, allSentAt: sent, lastVerifyAt: T - 1000 }), "wait");
  assert.equal(directUploadWatchdogAction({ now: T, lastProgressAt: sent, allSentAt: sent, lastVerifyAt: T - VERIFY_EVERY_MS }), "verify");
  // Still nothing after the finishing window: give up (the caller retries).
  assert.equal(directUploadWatchdogAction({ now: T, lastProgressAt: T - FINISH_WAIT_MS, allSentAt: T - FINISH_WAIT_MS }), "stall");
});

test("a stored object needs a 2xx answer and, when reported, the full size", () => {
  assert.equal(isStoredObjectResponse({ ok: true, status: 200, contentLength: "39327278" }, 39327278), true);
  assert.equal(isStoredObjectResponse({ ok: true, status: 200, contentLength: "1048576" }, 39327278), false, "partial file");
  assert.equal(isStoredObjectResponse({ ok: false, status: 400, contentLength: "0" }, 39327278), false, "not there yet");
  assert.equal(isStoredObjectResponse({ ok: true, status: 200, contentLength: null }, 39327278), true, "size not reported");
  assert.equal(isStoredObjectResponse({}, 10), false);
});
