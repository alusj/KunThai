import assert from "node:assert/strict";
import test from "node:test";

import {
  isDuplicateNameError,
  isUuid,
  mapServerCollections,
  planCollectionUpload,
  toggleCollectionPost,
} from "./savedCollectionsModel.js";

const POST_A = "20000000-0000-4000-8000-000000000001";
const POST_B = "20000000-0000-4000-8000-000000000002";
const POST_C = "20000000-0000-4000-8000-000000000003";

test("server rows become collections with unique post ids, oldest first", () => {
  const list = mapServerCollections([
    { id: "b", name: " Trips ", created_at: "2026-10-02", explore_saved_collection_items: [{ post_id: POST_A }, { post_id: POST_A }] },
    { id: "a", name: "Recipes", created_at: "2026-10-01", explore_saved_collection_items: [] },
    { name: "no id" },
  ]);
  assert.deepEqual(list.map((collection) => collection.id), ["a", "b"]);
  assert.equal(list[1].name, "Trips");
  assert.deepEqual(list[1].postIds, [POST_A]);
});

test("first sync uploads device-only collections and merges same-name ones", () => {
  const local = [
    { id: "collection-1", name: "recipes", postIds: [POST_A, POST_B, "legacy-id"] },
    { id: "collection-2", name: "Music", postIds: [POST_C] },
    { id: "collection-3", name: "MUSIC", postIds: [POST_A] },
    { id: "collection-4", name: "   ", postIds: [POST_A] },
  ];
  const server = [{ id: "s1", name: "Recipes", postIds: [POST_A] }];
  assert.deepEqual(planCollectionUpload(local, server), [
    { name: "Recipes", serverId: "s1", postIds: [POST_B] },
    { name: "Music", serverId: "", postIds: [POST_C] },
  ]);
});

test("nothing to upload when the server already has everything", () => {
  const local = [{ id: "s1", name: "Recipes", postIds: [POST_A] }];
  assert.deepEqual(planCollectionUpload(local, [{ id: "s1", name: "Recipes", postIds: [POST_A] }]), []);
  assert.deepEqual(planCollectionUpload([], []), []);
});

test("toggling a post adds or removes it in one collection only", () => {
  const list = [{ id: "a", postIds: [POST_A] }, { id: "b", postIds: [] }];
  const removed = toggleCollectionPost(list, "a", POST_A);
  assert.deepEqual(removed[0].postIds, []);
  assert.equal(removed[1], list[1]);
  assert.deepEqual(toggleCollectionPost(removed, "a", POST_A)[0].postIds, [POST_A]);
});

test("duplicate names are the unique violation 23505; ids are uuids", () => {
  assert.equal(isDuplicateNameError({ code: "23505" }), true);
  assert.equal(isDuplicateNameError({ code: "23503" }), false);
  assert.equal(isDuplicateNameError(null), false);
  assert.equal(isUuid(POST_A), true);
  assert.equal(isUuid("pending-123"), false);
});
