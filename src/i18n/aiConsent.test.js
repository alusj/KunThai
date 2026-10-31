import assert from "node:assert/strict";
import test from "node:test";

import { AI_CONSENT } from "./aiConsent.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];
const KEYS = ["allow", "body", "care", "decline", "declined", "title"];

test("every locale carries every KAI permission key", () => {
  assert.deepEqual(Object.keys(AI_CONSENT).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    const section = AI_CONSENT[locale];
    assert.deepEqual(Object.keys(section).sort(), KEYS, locale);
    for (const [key, value] of Object.entries(section)) assert.ok(value.trim(), `${locale}.${key} is empty`);
    if (locale !== "en") {
      for (const key of KEYS) assert.notEqual(section[key], AI_CONSENT.en[key], `${locale}.${key} copies English`);
    }
  }
});

test("the permission names who receives the data (Guideline 5.1.2(i))", () => {
  for (const locale of LOCALES) {
    assert.match(AI_CONSENT[locale].body, /Google/, `${locale}.body`);
    assert.match(AI_CONSENT[locale].body, /Gemini/, `${locale}.body`);
    assert.match(AI_CONSENT[locale].body, /KAI/, `${locale}.body`);
  }
});
