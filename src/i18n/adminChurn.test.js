import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { ADMIN_CHURN } from "./adminChurn.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];

function flatten(object, prefix = "") {
  return Object.entries(object).flatMap(([key, value]) => (
    value && typeof value === "object" ? flatten(value, `${prefix}${key}.`) : [[`${prefix}${key}`, value]]
  ));
}

const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

test("the admin Churn page carries the same keys and placeholders in every language", () => {
  assert.deepEqual(Object.keys(ADMIN_CHURN).sort(), [...LOCALES].sort());
  const english = Object.fromEntries(flatten(ADMIN_CHURN.en));
  for (const locale of LOCALES) {
    const entries = Object.fromEntries(flatten(ADMIN_CHURN[locale]));
    assert.deepEqual(Object.keys(entries).sort(), Object.keys(english).sort(), locale);
    for (const [key, value] of Object.entries(entries)) {
      assert.ok(String(value).trim(), `${locale} ${key} is empty`);
      assert.deepEqual(placeholders(value), placeholders(english[key]), `${locale} ${key} placeholders`);
    }
    assert.equal(entries["product.explore"], "Explore", `${locale} keeps Explore`);
    assert.equal(entries["product.swip"], "Swip", `${locale} keeps Swip`);
    assert.match(entries["product.urmall_buyer"], /UrMall/, `${locale} keeps UrMall`);
    assert.match(entries["product.urride_operator"], /UrRide/, `${locale} keeps UrRide`);
    assert.match(entries.unknownUser, /KunThai/, `${locale} keeps KunThai`);
  }
});

test("every key the page reads exists in English", () => {
  const view = readFileSync(new URL("../admin/views/ChurnIntelligenceView.jsx", import.meta.url), "utf8");
  const english = Object.fromEntries(flatten(ADMIN_CHURN.en));
  const used = [...view.matchAll(/tx\("([\w.]+)"/g)].map((match) => match[1]);
  for (const key of new Set([...used, "changeUp", "changeDown"])) assert.ok(key in english, `missing adminChurn.${key}`);
  for (const group of ["tab", "status", "signal", "action", "product"]) {
    assert.ok(Object.keys(ADMIN_CHURN.en[group]).length, group);
  }
});

test("every signal and action the scoring rules produce has a label", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261106140000_churn_scores.sql", import.meta.url), "utf8");
  const signals = new Set([...sql.matchAll(/'key', '(\w+)'/g)].map((match) => match[1]));
  const actions = new Set([...sql.matchAll(/then '(\w+_(?:comeback|boost|reminder|checkin|nudge|alert))'/g)].map((match) => match[1]));
  for (const match of sql.matchAll(/when '\w+' then '(\w+)'/g)) actions.add(match[1]);
  for (const match of sql.matchAll(/else '(\w+_(?:reminder|checkin))'/g)) actions.add(match[1]);
  assert.ok(signals.size >= 12, `found ${signals.size} signals`);
  for (const key of signals) assert.ok(ADMIN_CHURN.en.signal[key], `signal ${key} has no label`);
  for (const key of actions) assert.ok(ADMIN_CHURN.en.action[key], `action ${key} has no label`);
});
