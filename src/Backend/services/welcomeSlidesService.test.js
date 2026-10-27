import assert from "node:assert/strict";
import test from "node:test";

import { WELCOME_SEEN_KEY, markWelcomeSeen, shouldShowWelcome } from "./welcomeSlidesService.js";

function memoryStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    get length() { return map.size; },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

test("the welcome slides show on a fresh install, then never again", () => {
  const storage = memoryStorage();
  assert.equal(shouldShowWelcome({ storage, location: { search: "", hash: "" } }), true);
  markWelcomeSeen(storage);
  assert.equal(storage.getItem(WELCOME_SEEN_KEY), "1");
  assert.equal(shouldShowWelcome({ storage, location: { search: "", hash: "" } }), false);
});

test("a saved sign-in or a sign-in link skips the welcome slides", () => {
  const signedIn = memoryStorage({ "sb-abc-auth-token": "{\"access_token\":\"x\"}" });
  assert.equal(shouldShowWelcome({ storage: signedIn, location: { search: "", hash: "" } }), false);
  assert.equal(shouldShowWelcome({ storage: memoryStorage(), location: { search: "?code=1", hash: "" } }), false);
});

test("blocked storage never holds the user on the welcome slides", () => {
  const blocked = { getItem() { throw new Error("blocked"); } };
  assert.equal(shouldShowWelcome({ storage: blocked, location: { search: "", hash: "" } }), false);
  assert.equal(shouldShowWelcome({ storage: null }), false);
});
