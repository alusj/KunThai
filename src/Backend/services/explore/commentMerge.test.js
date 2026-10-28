import assert from "node:assert/strict";
import test from "node:test";

import { mergeSavedComment } from "./commentMerge.js";

const pending = {
  id: "pending-comment-1",
  post_id: "p1",
  parent_comment_id: null,
  user_id: "u1",
  body: "",
  audio_url: "data:audio/webm;base64,AAAA",
  pending: true,
};
const saved = { ...pending, id: "c1", audio_url: "https://cdn.example/comment-audio/u1/a.webm", pending: undefined };

test("realtime first, then the insert reply: one voice comment", () => {
  const afterRealtime = mergeSavedComment([pending], saved);
  assert.deepEqual(afterRealtime.map((c) => c.id), ["c1"]);
  const afterReply = mergeSavedComment(afterRealtime, saved, pending.id);
  assert.deepEqual(afterReply.map((c) => c.id), ["c1"]);
});

test("insert reply first, then realtime: one voice comment", () => {
  const afterReply = mergeSavedComment([pending], saved, pending.id);
  assert.deepEqual(afterReply.map((c) => c.id), ["c1"]);
  const afterRealtime = mergeSavedComment(afterReply, saved);
  assert.deepEqual(afterRealtime.map((c) => c.id), ["c1"]);
});

test("someone else's comment is added, a text comment does not take a voice copy", () => {
  const other = { id: "c2", post_id: "p1", user_id: "u2", body: "hi", audio_url: "" };
  assert.deepEqual(mergeSavedComment([pending], other).map((c) => c.id), ["pending-comment-1", "c2"]);
  const text = { ...saved, id: "c3", audio_url: "" };
  assert.deepEqual(mergeSavedComment([pending], text).map((c) => c.id), ["pending-comment-1", "c3"]);
});
