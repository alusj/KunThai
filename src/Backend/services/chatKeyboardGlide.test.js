import assert from "node:assert/strict";
import test from "node:test";
import { closingOffset, composerLift, threadShift } from "./chatKeyboardGlide.js";

test("the message box row lands just above the keyboard", () => {
  assert.equal(composerLift({ keyboardHeight: 358, composerPaddingBottom: 16, viewportHeight: 853, screenBottom: 853 }), 350);
});

test("a screen ending above the page bottom rises less", () => {
  assert.equal(composerLift({ keyboardHeight: 358, composerPaddingBottom: 16, viewportHeight: 853, screenBottom: 803 }), 300);
});

test("a long conversation rises with the message box", () => {
  assert.equal(threadShift({ lastMessageBottom: 760, threadBottom: 776, lift: 350 }), 350);
});

test("a short conversation clear of the message box stays where it is", () => {
  assert.equal(threadShift({ lastMessageBottom: 300, threadBottom: 776, lift: 350 }), 0);
});

test("a conversation partly in the way rises only as far as needed", () => {
  assert.equal(threadShift({ lastMessageBottom: 500, threadBottom: 776, lift: 350 }), 90);
});

test("an empty conversation does not move", () => {
  assert.equal(threadShift({ lastMessageBottom: null, threadBottom: 776, lift: 350 }), 0);
});

test("closing holds the messages exactly where they were", () => {
  assert.equal(closingOffset(1725, 1375), -350);
  assert.equal(closingOffset(100, 0), -100);
});
