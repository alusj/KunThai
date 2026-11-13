import assert from "node:assert/strict";
import test from "node:test";

import { refreshPostsInPlace } from "./refreshPostsInPlace.js";

const listed = [
  { id: "a", likes_count: 1, recommendation_score: 9, media_meta: { w: 1 } },
  { id: "b", likes_count: 2, recommendation_score: 5 },
  { id: "c", likes_count: 3, recommendation_score: 1 },
];

test("a quiet refresh keeps the listed posts and their order", () => {
  const next = refreshPostsInPlace(listed, [
    { id: "new", likes_count: 0, recommendation_score: 99 },
    { id: "b", likes_count: 7, recommendation_score: 50 },
  ]);
  assert.deepEqual(next.map((post) => post.id), ["a", "b", "c"]);
  assert.equal(next[1].likes_count, 7);
  // Its place in the ranking stays, so nothing sorts it elsewhere.
  assert.equal(next[1].recommendation_score, 5);
  // Posts with nothing new are the same objects (their cards are not redrawn).
  assert.equal(next[0], listed[0]);
  assert.equal(next[2], listed[2]);
});

test("nothing new returns the same list", () => {
  const fresh = listed.map((post) => ({ ...post, media_meta: post.media_meta ? { ...post.media_meta } : undefined }));
  assert.equal(refreshPostsInPlace(listed, fresh), listed);
  assert.equal(refreshPostsInPlace(listed, []), listed);
});

test("counts of a like still being sent are kept", () => {
  const next = refreshPostsInPlace(listed, [{ id: "a", likes_count: 40, saves_count: 4, body: "edited" }], (id) => id === "a");
  assert.equal(next[0].likes_count, 1);
  assert.equal(next[0].body, "edited");
});
