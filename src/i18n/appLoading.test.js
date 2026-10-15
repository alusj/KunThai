import assert from "node:assert/strict";
import test from "node:test";

import { APP_LOADING } from "./appLoading.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];

test("the slow-network notice and its Refresh button exist in every language", () => {
  assert.deepEqual(Object.keys(APP_LOADING).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(APP_LOADING[locale]).sort(), ["refresh", "slowNetwork"], locale);
    for (const value of Object.values(APP_LOADING[locale])) assert.ok(value.trim(), locale);
    assert.match(APP_LOADING[locale].slowNetwork, /KunThai/, `${locale} keeps the name KunThai`);
  }
});
