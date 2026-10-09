import assert from "node:assert/strict";
import test from "node:test";

import { URMALL_PLANS_2026 } from "./urmallPlans2026.js";

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

test("every locale carries every UrMall plan key with the same placeholders", () => {
  assert.deepEqual(Object.keys(URMALL_PLANS_2026).sort(), [...LOCALES].sort());
  const english = flatten(URMALL_PLANS_2026.en);
  assert.equal(Object.keys(english).length, 25);
  for (const locale of LOCALES) {
    const entries = flatten(URMALL_PLANS_2026[locale]);
    assert.deepEqual(Object.keys(entries).sort(), Object.keys(english).sort(), locale);
    for (const [key, value] of Object.entries(english)) {
      assert.equal(typeof entries[key], "string", `${locale}.${key}`);
      assert.ok(entries[key].trim(), `${locale}.${key} is empty`);
      assert.deepEqual(placeholders(entries[key]), placeholders(value), `${locale}.${key} placeholders`);
    }
  }
});

test("translations are translated, not copied from English", () => {
  const english = flatten(URMALL_PLANS_2026.en);
  for (const locale of LOCALES.filter((code) => code !== "en")) {
    const entries = flatten(URMALL_PLANS_2026[locale]);
    const copied = Object.keys(english).filter((key) => entries[key] === english[key] && english[key].length > 12);
    assert.deepEqual(copied, [], `${locale} copies English`);
  }
});

test("the English copy states the owner's plan numbers", () => {
  const { features, mealDays } = URMALL_PLANS_2026.en;
  assert.equal(features.listingsFree, "5 active products, meals or properties");
  assert.equal(features.listingsPro, "Up to 30 active products, meals or properties");
  assert.equal(features.listingsPremium, "Unlimited active products, meals or properties");
  assert.equal(features.mealsFiveDays, "Restaurant meals on up to 5 days a week");
  assert.match(mealDays.usage, /\{used\} of 7 days/);
});
