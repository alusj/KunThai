import assert from "node:assert/strict";
import test from "node:test";

import { COUNTRY_CHOICE_IDLE_RESET_MS, DETECTED_COUNTRY_MAX_AGE_MS, pickLegalCountry, shouldResetCountryChoice } from "./countryChoice.js";

const now = 1_800_000_000_000;

test("a picked country stays while KunThai is in use", () => {
  const choice = { iso2: "GN", at: now - 3 * 24 * 3600e3 };
  assert.equal(shouldResetCountryChoice({ choice, lastActiveAt: now - 60_000, now }), false);
  assert.equal(shouldResetCountryChoice({ choice, lastActiveAt: now - COUNTRY_CHOICE_IDLE_RESET_MS + 1000, now }), false);
});

test("a picked country resets after the app was unused for a while", () => {
  const choice = { iso2: "GN", at: now - 3600e3 };
  assert.equal(shouldResetCountryChoice({ choice, lastActiveAt: now - COUNTRY_CHOICE_IDLE_RESET_MS - 1000, now }), true);
});

test("nothing to reset without a picked country or a known last use", () => {
  assert.equal(shouldResetCountryChoice({ choice: null, lastActiveAt: 1, now }), false);
  assert.equal(shouldResetCountryChoice({ choice: { iso2: "GN" }, lastActiveAt: 0, now }), false);
});

test("the legal country is the recent detected one, else the time-zone country", () => {
  assert.equal(pickLegalCountry({ detected: { iso2: "SL", at: now - 3600e3 }, timeZoneIso: "GB", now }), "SL");
  assert.equal(pickLegalCountry({ detected: { iso2: "SL", at: now - DETECTED_COUNTRY_MAX_AGE_MS - 1 }, timeZoneIso: "GB", now }), "GB");
  assert.equal(pickLegalCountry({ detected: null, timeZoneIso: "sl", now }), "SL");
  assert.equal(pickLegalCountry({ detected: null, timeZoneIso: "", now }), "");
});
