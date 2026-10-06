import assert from "node:assert/strict";
import test from "node:test";

import { applySuggestionFilter, suggestionReason } from "./suggestionFilters.js";

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

test("reason labels map to translation keys", () => {
  assert.deepEqual(suggestionReason({ reasonKind: "mutual", mutual_count: 1 }), { key: "feed.reasonMutualOne" });
  assert.deepEqual(suggestionReason({ reasonKind: "mutual", mutual_count: 4 }), { key: "feed.reasonMutual", vars: { count: 4 } });
  assert.equal(suggestionReason({}), null);
});
