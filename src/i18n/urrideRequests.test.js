import assert from "node:assert/strict";
import test from "node:test";

import { URRIDE_REQUESTS } from "./urrideRequests.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];
const KEYS = Object.keys(URRIDE_REQUESTS.en).sort();

test("every locale carries every Fleet HQ request key", () => {
  assert.deepEqual(Object.keys(URRIDE_REQUESTS).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    const section = URRIDE_REQUESTS[locale];
    assert.deepEqual(Object.keys(section).sort(), KEYS, locale);
    for (const [key, value] of Object.entries(section)) assert.ok(value.trim(), `${locale}.${key} is empty`);
    if (locale !== "en") {
      for (const key of ["emptyTitle", "emptyBody", "openBookings"]) {
        assert.notEqual(section[key], URRIDE_REQUESTS.en[key], `${locale}.${key} copies English`);
      }
    }
  }
});

test("the counted headings keep their {n}", () => {
  for (const locale of LOCALES) {
    for (const key of ["bookings", "rentals", "operators"]) {
      assert.match(URRIDE_REQUESTS[locale][key], /\{n\}/, `${locale}.${key}`);
    }
  }
});
