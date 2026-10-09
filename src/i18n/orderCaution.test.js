import assert from "node:assert/strict";
import test from "node:test";

import { ORDER_CAUTION } from "./orderCaution.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];
const KINDS = ["retail", "vendor", "restaurant", "realEstate"];
const placeholders = (text) => (String(text).match(/\{[A-Za-z0-9_]+\}/g) || []).sort();

function flatten(node, prefix = "", result = {}) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") flatten(value, path, result);
    else result[path] = value;
  }
  return result;
}

test("every locale carries every order caution key with the same placeholders", () => {
  assert.deepEqual(Object.keys(ORDER_CAUTION).sort(), [...LOCALES].sort());
  const english = flatten(ORDER_CAUTION.en);
  assert.equal(Object.keys(english).length, 8 + KINDS.length * 7 + 2 + 6);
  for (const locale of LOCALES) {
    const entries = flatten(ORDER_CAUTION[locale]);
    assert.deepEqual(Object.keys(entries).sort(), Object.keys(english).sort(), locale);
    for (const [key, value] of Object.entries(english)) {
      assert.equal(typeof entries[key], "string", `${locale}.${key}`);
      assert.ok(entries[key].trim(), `${locale}.${key} is empty`);
      assert.deepEqual(placeholders(entries[key]), placeholders(value), `${locale}.${key} placeholders`);
    }
  }
});

test("translations are translated, not copied from English", () => {
  const english = flatten(ORDER_CAUTION.en);
  for (const locale of LOCALES.filter((code) => code !== "en")) {
    const entries = flatten(ORDER_CAUTION[locale]);
    const copied = Object.keys(english).filter((key) => entries[key] === english[key] && english[key].length > 12);
    assert.deepEqual(copied, [], `${locale} copies English`);
  }
});

test("each card names KunThai and the brand words stay untranslated", () => {
  for (const locale of LOCALES) {
    for (const kind of KINDS) {
      const section = ORDER_CAUTION[locale][kind];
      assert.match(section.intro, /KunThai/, `${locale}.${kind}.intro names KunThai`);
    }
    assert.match(ORDER_CAUTION[locale].common.chat, /UrMall/, `${locale}.common.chat names UrMall`);
    assert.match(ORDER_CAUTION[locale].common.chat, /OTP/, `${locale}.common.chat names OTP`);
    assert.match(ORDER_CAUTION[locale].common.report, /UrMall/, `${locale}.common.report names UrMall`);
  }
});
