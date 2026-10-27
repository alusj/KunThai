import assert from "node:assert/strict";
import test from "node:test";

import { ADMIN_YOUR_VOICE } from "./adminYourVoice.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];

test("the admin Your Voice page carries the same keys in every language", () => {
  const keys = Object.keys(ADMIN_YOUR_VOICE.en).sort();
  assert.deepEqual(Object.keys(ADMIN_YOUR_VOICE).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(ADMIN_YOUR_VOICE[locale]).sort(), keys, locale);
    for (const value of Object.values(ADMIN_YOUR_VOICE[locale])) assert.ok(value.trim(), locale);
    assert.equal(ADMIN_YOUR_VOICE[locale].title, "Your Voice", `${locale} keeps the name Your Voice`);
    assert.match(ADMIN_YOUR_VOICE[locale].sentFrom, /\{screen\}/, locale);
    assert.match(ADMIN_YOUR_VOICE[locale].unknownUser, /KunThai/, `${locale} keeps the name KunThai`);
  }
});
