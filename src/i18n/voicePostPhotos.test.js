import assert from "node:assert/strict";
import test from "node:test";

import { VOICE_POST_PHOTOS } from "./voicePostPhotos.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];

test("voice post photos carry the same keys in every language", () => {
  const keys = Object.keys(VOICE_POST_PHOTOS.en).sort();
  assert.deepEqual(Object.keys(VOICE_POST_PHOTOS).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(VOICE_POST_PHOTOS[locale]).sort(), keys, locale);
    for (const value of Object.values(VOICE_POST_PHOTOS[locale])) assert.ok(value.trim(), locale);
    assert.match(VOICE_POST_PHOTOS[locale].hint, /\{max\}/, locale);
    assert.match(VOICE_POST_PHOTOS[locale].limit, /\{max\}/, locale);
    assert.match(VOICE_POST_PHOTOS[locale].counter, /\{n\}/, locale);
    assert.match(VOICE_POST_PHOTOS[locale].counter, /\{total\}/, locale);
  }
});
