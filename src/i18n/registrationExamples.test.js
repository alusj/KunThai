import assert from "node:assert/strict";
import test from "node:test";

import { REGISTRATION_EXAMPLES } from "./registrationExamples.js";

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

test("every locale carries every registration example with the same placeholders", () => {
  assert.deepEqual(Object.keys(REGISTRATION_EXAMPLES).sort(), [...LOCALES].sort());
  const english = flatten(REGISTRATION_EXAMPLES.en);
  assert.equal(Object.keys(english).length, 59);
  for (const locale of LOCALES) {
    const entries = flatten(REGISTRATION_EXAMPLES[locale]);
    assert.deepEqual(Object.keys(entries).sort(), Object.keys(english).sort(), locale);
    for (const [key, value] of Object.entries(english)) {
      assert.equal(typeof entries[key], "string", `${locale}.${key}`);
      assert.ok(entries[key].trim(), `${locale}.${key} is empty`);
      assert.deepEqual(placeholders(entries[key]), placeholders(value), `${locale}.${key} placeholders`);
    }
  }
});

test("translations are translated, not copied from English", () => {
  const english = flatten(REGISTRATION_EXAMPLES.en);
  for (const locale of LOCALES.filter((code) => code !== "en")) {
    const entries = flatten(REGISTRATION_EXAMPLES[locale]);
    const copied = Object.keys(english).filter((key) => entries[key] === english[key]);
    assert.deepEqual(copied, [], `${locale} copies English`);
  }
});

test("UrRide examples mix fleets instead of centring on one vehicle", () => {
  const { urride } = REGISTRATION_EXAMPLES.en;
  assert.match(urride.bike.make, /TVS/);
  assert.match(urride.bike.model, /Boxer/);
  assert.match(urride.car.model, /Almera/);
  assert.match(urride.car.make, /Toyota/);
  assert.match(urride.van.model, /Hiace/);
  assert.match(urride.keke.model, /Bajaj RE/);
});
