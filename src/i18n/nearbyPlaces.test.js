import assert from "node:assert/strict";
import test from "node:test";

import { NEARBY_PLACES } from "./nearbyPlaces.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];
const KEYS = Object.keys(NEARBY_PLACES.en).sort();

test("every locale carries every Nearby Area place key", () => {
  assert.deepEqual(Object.keys(NEARBY_PLACES).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(NEARBY_PLACES[locale]).sort(), KEYS, locale);
    for (const [key, value] of Object.entries(NEARBY_PLACES[locale])) assert.ok(value.trim(), `${locale}.${key} is empty`);
    if (locale !== "en") {
      for (const key of ["strandedTitle", "garageDesc", "hotelDesc"]) assert.notEqual(NEARBY_PLACES[locale][key], NEARBY_PLACES.en[key], `${locale}.${key}`);
    }
  }
});
