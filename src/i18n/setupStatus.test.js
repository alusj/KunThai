import assert from "node:assert/strict";
import test from "node:test";

import { SETUP_STATUS } from "./setupStatus.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];
const KEYS = Object.keys(SETUP_STATUS.en).sort();

test("every locale carries every setup status key", () => {
  assert.deepEqual(Object.keys(SETUP_STATUS).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(SETUP_STATUS[locale]).sort(), KEYS, locale);
    for (const [key, value] of Object.entries(SETUP_STATUS[locale])) {
      assert.ok(value.trim(), `${locale}.${key} is empty`);
      if (locale !== "en") assert.notEqual(value, SETUP_STATUS.en[key], `${locale}.${key} copies English`);
    }
  }
});
