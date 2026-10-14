import assert from "node:assert/strict";
import test from "node:test";

import { VOICE_NOTES } from "./voiceNotes.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];
const placeholders = (text) => (String(text).match(/\{[A-Za-z0-9_]+\}/g) || []).sort();

test("every locale carries every voice note key with the same placeholders", () => {
  assert.deepEqual(Object.keys(VOICE_NOTES).sort(), [...LOCALES].sort());
  const english = VOICE_NOTES.en;
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(VOICE_NOTES[locale]).sort(), Object.keys(english).sort(), locale);
    for (const [key, value] of Object.entries(english)) {
      assert.ok(String(VOICE_NOTES[locale][key] || "").trim(), `${locale}.${key} is empty`);
      assert.deepEqual(placeholders(VOICE_NOTES[locale][key]), placeholders(value), `${locale}.${key} placeholders`);
    }
  }
});
