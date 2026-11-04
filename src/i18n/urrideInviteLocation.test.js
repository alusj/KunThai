import assert from "node:assert/strict";
import test from "node:test";

import { URRIDE_INVITE_LOCATION } from "./urrideInviteLocation.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];
const KEYS = Object.keys(URRIDE_INVITE_LOCATION.en).sort();

test("every locale carries the invitation location notice", () => {
  assert.deepEqual(Object.keys(URRIDE_INVITE_LOCATION).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    const section = URRIDE_INVITE_LOCATION[locale];
    assert.deepEqual(Object.keys(section).sort(), KEYS, locale);
    for (const [key, value] of Object.entries(section)) assert.ok(value.trim(), `${locale}.${key} is empty`);
    if (locale !== "en") {
      for (const key of KEYS) assert.notEqual(section[key], URRIDE_INVITE_LOCATION.en[key], `${locale}.${key} copies English`);
    }
  }
});

test("the notice names the inviting company", () => {
  for (const locale of LOCALES) {
    assert.match(URRIDE_INVITE_LOCATION[locale].body, /\{company\}/, locale);
  }
});
