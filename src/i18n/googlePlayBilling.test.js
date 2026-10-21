import assert from "node:assert/strict";
import test from "node:test";

import { APPLE_IAP } from "./appleIap.js";
import { GOOGLE_PLAY_BILLING } from "./googlePlayBilling.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];

test("every locale carries every Google Play key", () => {
  assert.deepEqual(Object.keys(GOOGLE_PLAY_BILLING).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    const section = GOOGLE_PLAY_BILLING[locale];
    assert.deepEqual(Object.keys(section).sort(), ["buying", "intro", "note", "pending"], locale);
    for (const [key, value] of Object.entries(section)) assert.ok(value.trim(), `${locale}.${key} is empty`);
    if (locale !== "en") {
      for (const key of Object.keys(section)) assert.notEqual(section[key], GOOGLE_PLAY_BILLING.en[key], `${locale}.${key} copies English`);
    }
  }
});

test("the Google Play lines name Google Play, never Apple, and point nowhere else to pay", () => {
  for (const locale of LOCALES) {
    for (const [key, value] of Object.entries(GOOGLE_PLAY_BILLING[locale])) {
      if (key !== "pending") assert.match(value, /Google Play/, `${locale}.${key}`);
      assert.doesNotMatch(value, /Apple|App Store|Monime|kunthai\.app|https?:/i, `${locale}.${key}`);
    }
  }
});

test("the shared panel lines it borrows from appleIap name no store", () => {
  for (const locale of LOCALES) {
    for (const key of ["loading", "unavailable", "pack", "buy", "added", "failed", "delayed"]) {
      assert.doesNotMatch(APPLE_IAP[locale][key], /Apple|App Store/, `${locale}.${key}`);
    }
  }
});
