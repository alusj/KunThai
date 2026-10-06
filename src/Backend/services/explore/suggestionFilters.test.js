import assert from "node:assert/strict";
import test from "node:test";

import { applySuggestionFilter, suggestionReason, suggestionSlotAfterPost, suggestionsForSlot } from "./suggestionFilters.js";

const people = [
  { id: "near", nearby: true, reasonKind: "nearby" },
  { id: "mutual3", mutual_count: 3, reasonKind: "mutual" },
  { id: "follows", followsYou: true, reasonKind: "follows_you" },
  { id: "chat", chatted: true, reasonKind: "chatted" },
  { id: "new", isNew: true, reasonKind: "new" },
  { id: "dir" }, // directory entry without signals
];

test("recommended keeps the database order and everyone", () => {
  assert.deepEqual(applySuggestionFilter(people, "recommended").map((p) => p.id), ["near", "mutual3", "follows", "chat", "new", "dir"]);
});

test("people you may know: follows you, then mutuals, then chatted", () => {
  assert.deepEqual(applySuggestionFilter(people, "know").map((p) => p.id), ["follows", "mutual3", "chat"]);
});

test("nearby and new keep only matching people", () => {
  assert.deepEqual(applySuggestionFilter(people, "nearby").map((p) => p.id), ["near"]);
  assert.deepEqual(applySuggestionFilter(people, "new").map((p) => p.id), ["new"]);
});

test("popular puts the most-followed first and keeps everyone", () => {
  const list = [
    { id: "a", follower_count: 2 },
    { id: "b", follower_count: 90 },
    { id: "c" },
    { id: "d", follower_count: 90 },
  ];
  assert.deepEqual(applySuggestionFilter(list, "popular").map((p) => p.id), ["b", "d", "a", "c"]);
});

test("reason labels map to translation keys", () => {
  assert.deepEqual(suggestionReason({ reasonKind: "mutual", mutual_count: 1 }), { key: "feed.reasonMutualOne" });
  assert.deepEqual(suggestionReason({ reasonKind: "mutual", mutual_count: 4 }), { key: "feed.reasonMutual", vars: { count: 4 } });
  assert.equal(suggestionReason({}), null);
});

test("suggestions card: after the 8th post, then every 35 posts", () => {
  const slots = [];
  for (let index = 0; index < 120; index += 1) {
    const slot = suggestionSlotAfterPost(index);
    if (slot >= 0) slots.push([index + 1, slot]);
  }
  assert.deepEqual(slots, [[8, 0], [43, 1], [78, 2], [113, 3]]);
});

test("each card shows the next group of people", () => {
  const people = Array.from({ length: 40 }, (_, index) => ({ id: index }));
  assert.equal(suggestionsForSlot(people, 0)[0].id, 0);
  assert.equal(suggestionsForSlot(people, 1)[0].id, 15);
  assert.equal(suggestionsForSlot(people, 2).length, 10);
  assert.deepEqual(suggestionsForSlot(people, 3), []);
});
