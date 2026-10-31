import assert from "node:assert/strict";
import test from "node:test";

import { buildPostShareHash, parsePostLinkHash } from "./postShareLink.js";

const id = "3f2b8c1e-9a7d-4e21-b0c4-5d6e7f8a9b0c";

test("a shared Swip link names the post and opens Swip", () => {
  const hash = buildPostShareHash(id, { swip: true });
  assert.equal(hash, `#kunthai-swip-${id}`);
  assert.deepEqual(parsePostLinkHash(hash), { kind: "post", id, tab: "Swip" });
});

test("a shared UrFeed post link opens UrFeed", () => {
  assert.deepEqual(parsePostLinkHash(buildPostShareHash(id)), { kind: "post", id, tab: "UrFeed" });
});

test("older #post- links still open the exact post (tab found from the post)", () => {
  assert.deepEqual(parsePostLinkHash(`#post-${id}`), { kind: "post", id, tab: "" });
  // The sharer's invite code after the id does not break it.
  assert.equal(parsePostLinkHash(`#kunthai-swip-${id}?kt_ref=ABC`)?.id, id);
});

test("other links are not posts", () => {
  for (const hash of ["", "#swip", "#urmall-seller-abcdef12", "#kunthai-profile-abcdef12", "#post-", "#post-<script>"]) {
    assert.equal(parsePostLinkHash(hash), null, hash);
  }
  assert.equal(buildPostShareHash(""), "");
});
