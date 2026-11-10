import assert from "node:assert/strict";
import test from "node:test";

import { REGISTRATION_RESUME } from "./registrationResume.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];
const KEYS = Object.keys(REGISTRATION_RESUME.en).sort();

test("every locale carries every key, with text", () => {
  assert.deepEqual(Object.keys(REGISTRATION_RESUME).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(REGISTRATION_RESUME[locale]).sort(), KEYS, locale);
    for (const key of KEYS) assert.ok(REGISTRATION_RESUME[locale][key].trim(), `${locale}.${key}`);
  }
});
