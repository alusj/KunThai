import assert from "node:assert/strict";
import test from "node:test";

import { VIDEO_SCREENING } from "./videoScreening.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];
const placeholders = (text) => (text.match(/\{[a-z]+\}/g) || []).sort();

test("the video check carries the same keys and placeholders in every language", () => {
  const keys = Object.keys(VIDEO_SCREENING.en).sort();
  assert.deepEqual(Object.keys(VIDEO_SCREENING).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(VIDEO_SCREENING[locale]).sort(), keys, locale);
    for (const key of keys) {
      assert.ok(VIDEO_SCREENING[locale][key].trim(), `${locale}.${key}`);
      assert.deepEqual(placeholders(VIDEO_SCREENING[locale][key]), placeholders(VIDEO_SCREENING.en[key]), `${locale}.${key}`);
    }
  }
});
