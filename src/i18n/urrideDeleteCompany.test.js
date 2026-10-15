import assert from "node:assert/strict";
import test from "node:test";

import { URRIDE_DELETE_COMPANY } from "./urrideDeleteCompany.js";

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

test("every locale carries every UrRide delete company key with the same placeholders", () => {
  assert.deepEqual(Object.keys(URRIDE_DELETE_COMPANY).sort(), [...LOCALES].sort());
  const english = flatten(URRIDE_DELETE_COMPANY.en);
  assert.equal(Object.keys(english).length, 17);
  for (const locale of LOCALES) {
    const entries = flatten(URRIDE_DELETE_COMPANY[locale]);
    assert.deepEqual(Object.keys(entries).sort(), Object.keys(english).sort(), locale);
    for (const [key, value] of Object.entries(english)) {
      assert.equal(typeof entries[key], "string", `${locale}.${key}`);
      assert.ok(entries[key].trim(), `${locale}.${key} is empty`);
      assert.deepEqual(placeholders(entries[key]), placeholders(value), `${locale}.${key} placeholders`);
    }
  }
});

test("translations are translated, not copied from English", () => {
  const english = flatten(URRIDE_DELETE_COMPANY.en);
  for (const locale of LOCALES.filter((code) => code !== "en")) {
    const entries = flatten(URRIDE_DELETE_COMPANY[locale]);
    const copied = Object.keys(english).filter((key) => entries[key] === english[key] && english[key].length > 12);
    assert.deepEqual(copied, [], `${locale} copies English`);
  }
});

test("English toasts are 15–25 characters", () => {
  for (const [key, value] of Object.entries(URRIDE_DELETE_COMPANY.en).filter(([name]) => name.startsWith("toast"))) {
    assert.ok(value.length >= 15 && value.length <= 25, `${key} (${value.length}) ${value}`);
  }
});
