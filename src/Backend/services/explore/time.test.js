import assert from "node:assert/strict";
import test from "node:test";

import { formatRelativeTime } from "./time.js";

const ago = (ms) => new Date(Date.now() - ms).toISOString();

test("something just posted reads Just now, not 1 min ago", () => {
  assert.equal(formatRelativeTime(new Date().toISOString()), "Just now");
  assert.equal(formatRelativeTime(ago(1_000)), "Just now");
  assert.equal(formatRelativeTime(ago(59_000)), "Just now");
  // A device clock running behind the server puts a fresh post in the future.
  assert.equal(formatRelativeTime(new Date(Date.now() + 30_000).toISOString()), "Just now");
});

test("minutes, hours and days keep counting from one minute", () => {
  assert.equal(formatRelativeTime(ago(60_000)), "1 min ago");
  assert.equal(formatRelativeTime(ago(2 * 60_000)), "2 mins ago");
  assert.equal(formatRelativeTime(ago(59 * 60_000)), "59 mins ago");
  assert.equal(formatRelativeTime(ago(60 * 60_000)), "1 hour ago");
  assert.equal(formatRelativeTime(ago(5 * 60 * 60_000)), "5 hours ago");
  assert.equal(formatRelativeTime(ago(24 * 60 * 60_000)), "1 day ago");
  assert.equal(formatRelativeTime(ago(3 * 24 * 60 * 60_000)), "3 days ago");
});

test("a missing or unreadable timestamp reads Just now", () => {
  assert.equal(formatRelativeTime(""), "Just now");
  assert.equal(formatRelativeTime(null), "Just now");
  assert.equal(formatRelativeTime("not a date"), "Just now");
});

test("relative times follow the selected language, including missing timestamps", () => {
  assert.equal(formatRelativeTime(ago(2 * 60_000), "fr"), "il y a 2 minutes");
  assert.equal(formatRelativeTime(ago(3 * 24 * 60 * 60_000), "es"), "hace 3 días");
  assert.equal(formatRelativeTime("", "zh"), "刚刚");
  assert.equal(formatRelativeTime("", "ar"), "الآن");
});
