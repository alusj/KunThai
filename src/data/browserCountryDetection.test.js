import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_COUNTRY_ISO,
  detectDeviceCountryIso,
  applyCountryConfigOverrides,
  getActiveCountryProfile,
  getCountryFromInternationalPhone,
} from "./globalCountryProfiles.js";

test("a saved international number tells its dial country; shared codes prefer the account's", () => {
  assert.equal(getCountryFromInternationalPhone("+232 99 000 000")?.iso2, "SL");
  assert.equal(getCountryFromInternationalPhone("+1 555 010 0000", "CA")?.iso2, "CA");
  assert.equal(getCountryFromInternationalPhone("+1 555 010 0000")?.dialCode, "+1");
  assert.equal(getCountryFromInternationalPhone("99 000 000"), null);
  assert.equal(getCountryFromInternationalPhone(""), null);
});

function withLanguages(languages, run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    value: { language: languages[0], languages },
    configurable: true,
  });
  try {
    return run();
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete globalThis.navigator;
  }
}

test("an en-US device is never placed in the United States by its language", () => {
  // Even when the database lists the US as an active market.
  applyCountryConfigOverrides({ countries: [{ iso2: "US", marketStatus: "active" }] });
  withLanguages(["en-US"], () => {
    assert.equal(getActiveCountryProfile().iso2, detectDeviceCountryIso() || DEFAULT_COUNTRY_ISO);
    assert.notEqual(getActiveCountryProfile().iso2, detectDeviceCountryIso() ? "" : "SL");
  });
});

test("an explicit country still wins", () => {
  withLanguages(["en-US"], () => {
    assert.equal(getActiveCountryProfile("GH").iso2, "GH");
  });
});
