import test from "node:test";
import assert from "node:assert/strict";

import { mergeExploreDiscoveryItems } from "./connectionDirectoryModels.js";

test("discovery preserves ranked people and appends the complete directory", () => {
  const directory = Array.from({ length: 240 }, (_, index) => ({
    id: `profile:user-${index}`,
    identity_type: "profile",
    identity_id: `user-${index}`,
    user_id: `user-${index}`,
  }));
  const ranked = directory.slice(0, 200).reverse();

  const result = mergeExploreDiscoveryItems(ranked, directory);

  assert.equal(result.length, 240);
  assert.equal(result[0].user_id, "user-199");
  assert.equal(result.at(-1).user_id, "user-239");
});

test("discovery keeps Spaces while removing duplicate identities", () => {
  const person = { identity_type: "profile", identity_id: "person-1", user_id: "person-1" };
  const space = { identity_type: "space", identity_id: "space-1", space_id: "space-1" };

  const result = mergeExploreDiscoveryItems([person], [person, { ...person }, space]);

  assert.deepEqual(result, [person, space]);
});

test("ranked results cannot restore an account excluded by the safe directory", () => {
  const eligible = { identity_type: "profile", identity_id: "person-1", user_id: "person-1" };
  const excluded = { identity_type: "profile", identity_id: "person-2", user_id: "person-2" };

  const result = mergeExploreDiscoveryItems([excluded, eligible], [eligible]);

  assert.deepEqual(result, [eligible]);
});
