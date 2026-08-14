import assert from "node:assert/strict";
import test from "node:test";

import {
  getBlockedIdentityStorageKeys,
  normalizeBlockedIdentityValues,
} from "./safetyIdentityUtils.js";

test("blocked profile UUIDs and profile identity keys resolve to one frontend identity", () => {
  const profileId = "2751bcc6-a38a-4d77-ac3f-6ea111111111";
  const identities = normalizeBlockedIdentityValues([
    profileId,
    `profile:${profileId}`,
    "space:18097d9e-3221-46dd-8805-1d1111111111",
  ]);

  assert.deepEqual(identities, [
    { type: "profile", id: profileId, key: `profile:${profileId}` },
    { type: "space", id: "18097d9e-3221-46dd-8805-1d1111111111", key: "space:18097d9e-3221-46dd-8805-1d1111111111" },
  ]);
});

test("unblocking a profile targets both legacy UUID and canonical identity key", () => {
  const profileId = "2751bcc6-a38a-4d77-ac3f-6ea111111111";
  assert.deepEqual(getBlockedIdentityStorageKeys(profileId), [profileId, `profile:${profileId}`]);
});
