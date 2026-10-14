import assert from "node:assert/strict";
import test from "node:test";

import { URMALL_SETTINGS } from "./urmallSettings.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];

test("every UrMall buyer setting is translated in every language", () => {
  assert.deepEqual(Object.keys(URMALL_SETTINGS).sort(), [...LOCALES].sort());
  const keys = Object.keys(URMALL_SETTINGS.en).sort();
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(URMALL_SETTINGS[locale]).sort(), keys, locale);
    for (const [key, value] of Object.entries(URMALL_SETTINGS[locale])) assert.ok(value.trim(), `${locale}.${key}`);
  }
});

test("the English toasts follow the 15-25 character rule", () => {
  for (const key of Object.keys(URMALL_SETTINGS.en).filter((name) => /(On|Off|Cleared|Failed)$/.test(name))) {
    const length = URMALL_SETTINGS.en[key].length;
    assert.ok(length >= 15 && length <= 25, `${key} is ${length} characters`);
  }
});
