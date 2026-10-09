import assert from "node:assert/strict";
import test from "node:test";

import { REGISTRATION_SAVING } from "./registrationSaving.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];
const BRAND_ONLY = new Set(["UrMall", "UrRide", "Fleet HQ"]);
const placeholders = (text) => (String(text).match(/\{[A-Za-z0-9_]+\}/g) || []).sort();

function flatten(node, prefix = "", result = {}) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") flatten(value, path, result);
    else result[path] = value;
  }
  return result;
}

test("every locale carries every registration saving key with the same placeholders", () => {
  assert.deepEqual(Object.keys(REGISTRATION_SAVING).sort(), [...LOCALES].sort());
  const english = flatten(REGISTRATION_SAVING.en);
  assert.ok(Object.keys(english).length >= 30);
  for (const locale of LOCALES) {
    const entries = flatten(REGISTRATION_SAVING[locale]);
    assert.deepEqual(Object.keys(entries).sort(), Object.keys(english).sort(), locale);
    for (const [key, value] of Object.entries(english)) {
      assert.equal(typeof entries[key], "string", `${locale}.${key}`);
      assert.ok(entries[key].trim(), `${locale}.${key} is empty`);
      assert.deepEqual(placeholders(entries[key]), placeholders(value), `${locale}.${key} placeholders`);
    }
  }
});

test("translations are translated, not copied from English", () => {
  const english = flatten(REGISTRATION_SAVING.en);
  for (const locale of LOCALES.filter((code) => code !== "en")) {
    const entries = flatten(REGISTRATION_SAVING[locale]);
    const copied = Object.keys(english).filter((key) => entries[key] === english[key] && !BRAND_ONLY.has(english[key]));
    assert.deepEqual(copied, [], `${locale} copies English`);
  }
});

test("brand names stay as they are in every language", () => {
  for (const locale of LOCALES) {
    const section = REGISTRATION_SAVING[locale];
    assert.equal(section.toastTitleUrmall, "UrMall", locale);
    assert.equal(section.toastTitleUrride, "UrRide", locale);
    assert.equal(section.toastTitleFleetHq, "Fleet HQ", locale);
    for (const key of ["waitUrmall", "waitSolo", "waitCompany"]) assert.match(section[key], /KunThai/, `${locale}.${key}`);
    assert.match(section.titleUrmall, /UrMall/, locale);
    assert.match(section.titleSolo, /UrRide/, locale);
    assert.match(section.titleCompany, /Fleet HQ/, locale);
  }
});

test("English toast messages fit the 15–25 character toast rule", () => {
  const toastKeys = ["toastDoneUrmall", "toastDoneSolo", "toastDoneCompany", "toastFailed", "toastUnfinished", "toastPartialUrmall", "toastPartialCompany"];
  for (const key of toastKeys) {
    const length = [...REGISTRATION_SAVING.en[key]].length;
    assert.ok(length >= 15 && length <= 25, `${key} is ${length} characters`);
  }
});
