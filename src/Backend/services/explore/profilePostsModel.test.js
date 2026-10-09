import assert from "node:assert/strict";
import test from "node:test";

import {
  canManageExplorePost,
  collectionNameTaken,
  escapeLikePattern,
  getCollectionsStorageKey,
  getPostSurface,
  mergePostPages,
  normalizeCollectionName,
  orderPostsByIds,
  postBelongsToSurface,
  resolveProfileDisplayName,
  sameUsername,
  shouldReplaceEditedProfile,
  validateSpaceSlug,
  validateUsername,
} from "./profilePostsModel.js";

test("posts are split into Feed and Swip by video", () => {
  assert.equal(getPostSurface({ video_url: "https://v" }), "swip");
  assert.equal(getPostSurface({ video_url: "  " }), "feed");
  assert.equal(getPostSurface({ image_url: "https://i" }), "feed");
  assert.equal(postBelongsToSurface({ video_url: "x" }, "all"), true);
  assert.equal(postBelongsToSurface({ video_url: "x" }, "feed"), false);
});

test("pages merge without duplicates and saved order is kept", () => {
  assert.deepEqual(mergePostPages([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }, { id: "c" }]).map((p) => p.id), ["a", "b", "c"]);
  assert.deepEqual(orderPostsByIds([{ id: "a" }, { id: "b" }], ["b", "x", "a"]).map((p) => p.id), ["b", "a"]);
});

test("only the author or a Space owner/admin may manage a post", () => {
  const spaces = [
    { spaceId: "s1", memberRole: "administrator", membershipStatus: "active" },
    { spaceId: "s2", memberRole: "editor", membershipStatus: "active" },
    { spaceId: "s3", memberRole: "owner", membershipStatus: "pending" },
  ];
  assert.equal(canManageExplorePost({ id: "1", user_id: "me" }, { currentUserId: "me" }), true);
  assert.equal(canManageExplorePost({ id: "1", user_id: "other", actor_type: "space", space_id: "s1" }, { currentUserId: "me", spaces }), true);
  assert.equal(canManageExplorePost({ id: "1", user_id: "other", actor_type: "space", space_id: "s2" }, { currentUserId: "me", spaces }), false);
  assert.equal(canManageExplorePost({ id: "1", user_id: "other", actor_type: "space", space_id: "s3" }, { currentUserId: "me", spaces }), false);
  assert.equal(canManageExplorePost({ id: "1", user_id: "other" }, { currentUserId: "me", spaces }), false);
});

test("usernames: 3-30 letters, digits, dots, underscores, no leading dot", () => {
  assert.equal(validateUsername("amara_k.1"), "");
  assert.equal(validateUsername("ab"), "length");
  assert.equal(validateUsername("a".repeat(31)), "length");
  assert.equal(validateUsername(".amara"), "leadingDot");
  assert.equal(validateUsername("amara k"), "characters");
  assert.equal(validateUsername("amara@x"), "characters");
  assert.equal(sameUsername(" Amara ", "amara"), true);
});

test("Space handles are lowercase slugs", () => {
  assert.equal(validateSpaceSlug("acme-ltd"), "");
  assert.equal(validateSpaceSlug("Acme"), "characters");
  assert.equal(validateSpaceSlug("acme--ltd"), "characters");
  assert.equal(validateSpaceSlug("ac"), "length");
});

test("a display name never falls back to an email", () => {
  assert.equal(resolveProfileDisplayName("  ", "amara"), "amara");
  assert.equal(resolveProfileDisplayName("a@b.com", "amara"), "amara");
  assert.equal(resolveProfileDisplayName("", "a@b.com"), "");
  assert.equal(resolveProfileDisplayName("Amara K", "amara"), "Amara K");
});

test("LIKE wildcards are escaped for exact username lookups", () => {
  assert.equal(escapeLikePattern("a_b%c"), "a\\_b\\%c");
});

test("collections are per account and names are unique ignoring case", () => {
  assert.equal(getCollectionsStorageKey(""), "");
  assert.equal(getCollectionsStorageKey("u1"), "explore-saved-collections:u1");
  assert.equal(normalizeCollectionName("  Trips   2026 "), "Trips 2026");
  const collections = [{ id: "c1", name: "Trips" }];
  assert.equal(collectionNameTaken(collections, " trips "), true);
  assert.equal(collectionNameTaken(collections, "Trips", "c1"), false);
  assert.equal(collectionNameTaken(collections, "Food"), false);
});

test("the edit form keeps edits unless the profile changed", () => {
  assert.equal(shouldReplaceEditedProfile({ userId: "u1", displayName: "edited" }, { userId: "u1", displayName: "old" }), false);
  assert.equal(shouldReplaceEditedProfile({ userId: "u1" }, { userId: "u2" }), true);
  assert.equal(shouldReplaceEditedProfile({ userId: "u1", updatedAt: "1" }, { userId: "u1", updatedAt: "2" }), true);
  assert.equal(shouldReplaceEditedProfile({}, { userId: "u1" }), true);
});
