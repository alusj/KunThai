import assert from "node:assert/strict";
import test from "node:test";

import {
  AREA_VIEW_GUIDE_DISMISSED_KEY,
  dismissAreaViewGuide,
  shouldShowAreaViewGuide,
} from "./areaViewGuideService.js";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("Area View explains itself until the user chooses not to see the guide again", () => {
  const storage = createStorage();
  assert.equal(shouldShowAreaViewGuide(storage), true);

  assert.equal(dismissAreaViewGuide(storage), true);
  assert.equal(storage.getItem(AREA_VIEW_GUIDE_DISMISSED_KEY), "true");
  assert.equal(shouldShowAreaViewGuide(storage), false);
});

test("an unavailable preference store never blocks the first-use guide", () => {
  const unavailableStorage = {
    getItem() {
      throw new Error("storage unavailable");
    },
    setItem() {
      throw new Error("storage unavailable");
    },
  };

  assert.equal(shouldShowAreaViewGuide(unavailableStorage), true);
  assert.equal(dismissAreaViewGuide(unavailableStorage), false);
});
