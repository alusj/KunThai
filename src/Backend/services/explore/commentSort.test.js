import assert from "node:assert/strict";
import test from "node:test";

import { commentPopularity, sortCommentThread } from "./commentSort.js";

const thread = [
  { id: "a", created_at: "2026-01-01T10:00:00Z", likes_count: 1, replies: [] },
  { id: "b", created_at: "2026-01-02T10:00:00Z", likes_count: 0, replies: [{ id: "b1" }, { id: "b2" }] },
  { id: "c", created_at: "2026-01-03T10:00:00Z", likes_count: 0, replies: [] },
];

test("newest puts the latest comment first", () => {
  assert.deepEqual(sortCommentThread(thread, "newest").map((c) => c.id), ["c", "b", "a"]);
});

test("oldest keeps posted order", () => {
  assert.deepEqual(sortCommentThread(thread, "oldest").map((c) => c.id), ["a", "b", "c"]);
});

test("top ranks by likes and replies, newest breaks ties", () => {
  assert.equal(commentPopularity(thread[1]), 4);
  assert.deepEqual(sortCommentThread(thread, "top").map((c) => c.id), ["b", "a", "c"]);
});

test("sorting never mutates the original thread", () => {
  const before = thread.map((c) => c.id);
  sortCommentThread(thread, "newest");
  assert.deepEqual(thread.map((c) => c.id), before);
});
