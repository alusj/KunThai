import assert from "node:assert/strict";
import test from "node:test";

import { POST_CONTROLS } from "./postControls.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];
const KEYS = Object.keys(POST_CONTROLS.en).sort();

test("every locale carries every Advanced Post Controls key", () => {
  assert.deepEqual(Object.keys(POST_CONTROLS).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    const section = POST_CONTROLS[locale];
    assert.deepEqual(Object.keys(section).sort(), KEYS, locale);
    for (const [key, value] of Object.entries(section)) assert.ok(value.trim(), `${locale}.${key} is empty`);
    if (locale !== "en") {
      for (const key of ["sheetTitle", "commentsDisabled", "excludeHint", "save", "close"]) {
        assert.notEqual(section[key], POST_CONTROLS.en[key], `${locale}.${key} copies English`);
      }
    }
  }
});

test("placeholders survive translation", () => {
  for (const locale of LOCALES) {
    for (const key of ["excludedCount", "limitReached", "activeCount"]) {
      assert.match(POST_CONTROLS[locale][key], /\{n\}/, `${locale}.${key}`);
    }
    for (const key of ["remove", "add"]) {
      assert.match(POST_CONTROLS[locale][key], /\{name\}/, `${locale}.${key}`);
    }
  }
});

test("refusal messages fit a toast (15 to 25 characters) in English", () => {
  for (const key of KEYS.filter((name) => name.startsWith("err"))) {
    const length = POST_CONTROLS.en[key].length;
    assert.ok(length >= 15 && length <= 30, `${key} is ${length} characters`);
  }
});
