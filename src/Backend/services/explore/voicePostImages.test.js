import assert from "node:assert/strict";
import test from "node:test";

import { MAX_VOICE_POST_IMAGES, postImageUrls, remainingVoicePostImages, withPostImages } from "./voicePostImages.js";

test("a post's photos list the cover first, without blanks or repeats", () => {
  assert.deepEqual(postImageUrls({ image_url: "a" }), ["a"]);
  assert.deepEqual(postImageUrls({ image_url: "a", media_meta: { images: ["a", "b", "", null, "b", "c"] } }), ["a", "b", "c"]);
  assert.deepEqual(postImageUrls({ media_meta: { images: ["b"] } }), ["b"]);
  assert.deepEqual(postImageUrls({}), []);
  assert.deepEqual(postImageUrls(null), []);
});

test("saved media_meta keeps only the uploaded photo set", () => {
  assert.deepEqual(withPostImages({ title: "t", images: ["blob:x"] }, ["u1"]), { title: "t" });
  assert.deepEqual(withPostImages({ title: "t" }, ["u1", "u2"]), { title: "t", images: ["u1", "u2"] });
  const many = Array.from({ length: MAX_VOICE_POST_IMAGES + 3 }, (_, index) => `u${index}`);
  assert.equal(withPostImages({}, many).images.length, MAX_VOICE_POST_IMAGES);
  assert.deepEqual(withPostImages(null, []), {});
});

test("remaining photo slots never go below zero", () => {
  assert.equal(remainingVoicePostImages(0), MAX_VOICE_POST_IMAGES);
  assert.equal(remainingVoicePostImages(2), MAX_VOICE_POST_IMAGES - 2);
  assert.equal(remainingVoicePostImages(99), 0);
});
