import test from "node:test";
import assert from "node:assert/strict";

import { getProfileIdentity, normalizeIdentityTarget, postMatchesIdentity } from "./identityService.js";

const SPACE_ID = "57b011b5-6ce9-4689-950f-0520a5a9ca2e";

test("a normalized Space identity stays a Space when normalized again", () => {
  const identity = getProfileIdentity({ identityType: "space", identityId: SPACE_ID, spaceId: SPACE_ID, userId: "owner-1" });
  assert.equal(identity.key, `space:${SPACE_ID}`);
  assert.deepEqual(normalizeIdentityTarget(identity), identity);
});

test("a Space profile matches only the Space's posts, not its owner's", () => {
  const identity = getProfileIdentity({ identityType: "space", identityId: SPACE_ID, spaceId: SPACE_ID, userId: "owner-1" });
  const spacePost = { user_id: "owner-1", actor_type: "space", actor_id: SPACE_ID, space_id: SPACE_ID };
  const ownerPost = { user_id: "owner-1", actor_type: "profile", actor_id: "owner-1" };
  assert.equal(postMatchesIdentity(spacePost, identity), true);
  assert.equal(postMatchesIdentity(ownerPost, identity), false);
});
