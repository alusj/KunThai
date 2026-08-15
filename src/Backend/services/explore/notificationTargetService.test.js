import assert from "node:assert/strict";
import test from "node:test";

import { getExplorePostTargetTab } from "./notificationTargetService.js";

test("notification targets route regular and circle posts to UrFeed", () => {
  assert.equal(getExplorePostTargetTab({ post_type: "post", feed_scope: "feed" }), "UrFeed");
  assert.equal(getExplorePostTargetTab({ post_type: "post", feed_scope: "connections" }), "UrFeed");
});

test("notification targets route Swip posts by canonical post metadata", () => {
  assert.equal(getExplorePostTargetTab({ post_type: "video", feed_scope: "feed" }), "Swip");
  assert.equal(getExplorePostTargetTab({ post_type: "post", feed_scope: "swip" }), "Swip");
  assert.equal(getExplorePostTargetTab({ post_type: "post", category: "swip" }), "Swip");
});

test("notification routing does not rely on an incomplete notification media label", () => {
  assert.equal(getExplorePostTargetTab({ post_type: "video", media_type: "post" }), "Swip");
  assert.equal(getExplorePostTargetTab({ post_type: "post", media_type: "video" }), "UrFeed");
});

