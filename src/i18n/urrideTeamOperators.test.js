import assert from "node:assert/strict";
import test from "node:test";

import { URRIDE_TEAM_OPERATORS } from "./urrideTeamOperators.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];
const placeholders = (text) => (String(text).match(/\{[A-Za-z0-9_]+\}/g) || []).sort();

test("every locale carries every key with the same placeholders", () => {
  assert.deepEqual(Object.keys(URRIDE_TEAM_OPERATORS).sort(), [...LOCALES].sort());
  const english = URRIDE_TEAM_OPERATORS.en;
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(URRIDE_TEAM_OPERATORS[locale]).sort(), Object.keys(english).sort(), locale);
    for (const [key, value] of Object.entries(english)) {
      assert.ok(URRIDE_TEAM_OPERATORS[locale][key].trim(), `${locale}.${key}`);
      assert.deepEqual(placeholders(URRIDE_TEAM_OPERATORS[locale][key]), placeholders(value), `${locale}.${key}`);
    }
  }
});
