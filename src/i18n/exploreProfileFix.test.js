import assert from "node:assert/strict";
import test from "node:test";

import { EXPLORE_PROFILE_FIX } from "./exploreProfileFix.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];
const placeholders = (text) => (text.match(/\{[A-Za-z0-9_]+\}/g) || []).sort();

test("every locale carries the same profile-fix keys and placeholders", () => {
  assert.deepEqual(Object.keys(EXPLORE_PROFILE_FIX).sort(), [...LOCALES].sort());
  const english = EXPLORE_PROFILE_FIX.en;
  for (const locale of LOCALES) {
    const section = EXPLORE_PROFILE_FIX[locale];
    assert.deepEqual(Object.keys(section).sort(), Object.keys(english).sort(), `${locale} keys`);
    for (const [key, value] of Object.entries(english)) {
      assert.ok(String(section[key] || "").trim(), `${locale}.${key} is empty`);
      assert.deepEqual(placeholders(section[key]), placeholders(value), `${locale}.${key} placeholders`);
    }
  }
});
