import assert from "node:assert/strict";
import test from "node:test";

import { DIRECTION_CARDS } from "./directionCards.js";
import { DIRECTION_CARD_ORDER } from "../components/shared/directionCards/directionCardModel.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];

test("direction cards exist for all 15 locales", () => {
  assert.deepEqual(Object.keys(DIRECTION_CARDS).sort(), [...LOCALES].sort());
});

test("every locale carries exactly the English card ids", () => {
  const english = Object.keys(DIRECTION_CARDS.en.cards).sort();
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(DIRECTION_CARDS[locale].cards).sort(), english, `${locale} card ids differ from en`);
  }
});

test("photo search and add-location cards have a title and body everywhere", () => {
  for (const id of ["urmall-photo-search", "area-add-location"]) {
    assert.ok(DIRECTION_CARD_ORDER.includes(id), `${id} missing from DIRECTION_CARD_ORDER`);
    for (const locale of LOCALES) {
      const [title, body] = DIRECTION_CARDS[locale].cards[id] || [];
      assert.ok(title?.trim() && body?.trim(), `${locale}:${id} missing`);
      if (id === "area-add-location") assert.ok(body.includes("+"),`${locale}:${id} should mention +`);
    }
  }
});
