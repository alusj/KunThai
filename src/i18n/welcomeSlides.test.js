import assert from "node:assert/strict";
import test from "node:test";

import { WELCOME_SLIDES } from "./welcomeSlides.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];

test("the welcome slides carry the same keys in every language", () => {
  const keys = Object.keys(WELCOME_SLIDES.en).sort();
  assert.deepEqual(Object.keys(WELCOME_SLIDES).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(WELCOME_SLIDES[locale]).sort(), keys, locale);
    for (const value of Object.values(WELCOME_SLIDES[locale])) assert.ok(value.trim(), locale);
    assert.match(WELCOME_SLIDES[locale].slideLabel, /\{n\}/, locale);
    assert.match(WELCOME_SLIDES[locale].slideLabel, /\{total\}/, locale);
    assert.match(WELCOME_SLIDES[locale].urmallTitle, /UrMall/, `${locale} keeps the name UrMall`);
    assert.match(WELCOME_SLIDES[locale].urrideTitle, /UrRide/, `${locale} keeps the name UrRide`);
    assert.match(WELCOME_SLIDES[locale].exploreBody, /Swip/, `${locale} keeps the name Swip`);
  }
});
