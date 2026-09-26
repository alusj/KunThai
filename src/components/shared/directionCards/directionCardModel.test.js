import assert from "node:assert/strict";
import test from "node:test";

import { DIRECTION_CARDS } from "../../../i18n/directionCards.js";
import {
  DIRECTION_CARD_ORDER,
  pickDirection,
  placeDirectionCard,
  readSeenDirections,
  writeSeenDirections,
} from "./directionCardModel.js";

function memoryStorage() {
  const map = new Map();
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)) };
}

test("every direction card has copy in every locale", () => {
  for (const [locale, copy] of Object.entries(DIRECTION_CARDS)) {
    for (const id of DIRECTION_CARD_ORDER) {
      const entry = copy.cards[id];
      assert.ok(Array.isArray(entry) && entry[0] && entry[1], `${locale}:${id} missing`);
    }
    for (const key of ["gotIt", "hideAll", "close", "tip"]) assert.ok(copy.ui[key], `${locale}:ui.${key} missing`);
  }
});

test("picks the highest-priority unseen visible button", () => {
  assert.equal(pickDirection(["kai-assistant", "explore-create"], new Set()), "explore-create");
  assert.equal(pickDirection(["kai-assistant", "explore-create"], new Set(["explore-create"])), "kai-assistant");
  assert.equal(pickDirection(["kai-assistant"], new Set(["kai-assistant"])), "");
  assert.equal(pickDirection(["unknown-button"], new Set()), "");
});

test("seen tips are remembered per account", () => {
  const storage = memoryStorage();
  writeSeenDirections(storage, "user-a", new Set(["explore-create"]));
  assert.deepEqual([...readSeenDirections(storage, "user-a")], ["explore-create"]);
  assert.equal(readSeenDirections(storage, "user-b").size, 0);
  storage.setItem("kunthai.directionCards.v1:user-c", "{broken");
  assert.equal(readSeenDirections(storage, "user-c").size, 0);
});

test("card sits below a header button and stays inside the phone gutter", () => {
  const place = placeDirectionCard({ left: 330, top: 20, width: 40, height: 40, bottom: 60 }, { width: 390, height: 800 }, { width: 320, height: 150 });
  assert.equal(place.side, "below");
  assert.equal(place.top, 74);
  assert.equal(place.left, 390 - 16 - 320);
  assert.ok(place.arrowX <= place.width - 22);
});

test("card flips above a button near the bottom of the screen", () => {
  const place = placeDirectionCard({ left: 20, top: 720, width: 56, height: 56, bottom: 776 }, { width: 390, height: 800 }, { width: 320, height: 150 });
  assert.equal(place.side, "above");
  assert.equal(place.top, 720 - 14 - 150);
  assert.equal(place.left, 16);
  assert.equal(place.arrowX, 32);
});
