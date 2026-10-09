import assert from "node:assert/strict";
import test from "node:test";

import { KAI_LISTING_FIX } from "./kaiListingFix.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];
const placeholders = (text) => (String(text).match(/\{[A-Za-z0-9_]+\}/g) || []).sort();

function flatten(node, prefix = "", result = {}) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") flatten(value, path, result);
    else result[path] = value;
  }
  return result;
}

test("every locale carries every KAI listing fix key with the same placeholders", () => {
  assert.deepEqual(Object.keys(KAI_LISTING_FIX).sort(), [...LOCALES].sort());
  const english = flatten(KAI_LISTING_FIX.en);
  assert.equal(Object.keys(english).length, 15);
  for (const locale of LOCALES) {
    const entries = flatten(KAI_LISTING_FIX[locale]);
    assert.deepEqual(Object.keys(entries).sort(), Object.keys(english).sort(), locale);
    for (const [key, value] of Object.entries(english)) {
      assert.equal(typeof entries[key], "string", `${locale}.${key}`);
      assert.ok(entries[key].trim(), `${locale}.${key} is empty`);
      assert.deepEqual(placeholders(entries[key]), placeholders(value), `${locale}.${key} placeholders`);
    }
  }
});

test("translations are translated, not copied from English", () => {
  const english = flatten(KAI_LISTING_FIX.en);
  for (const locale of LOCALES.filter((code) => code !== "en")) {
    const entries = flatten(KAI_LISTING_FIX[locale]);
    const copied = Object.keys(english).filter((key) => entries[key] === english[key] && english[key].length > 12);
    assert.deepEqual(copied, [], `${locale} copies English`);
  }
});
