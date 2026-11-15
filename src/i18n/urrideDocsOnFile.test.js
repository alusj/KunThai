import assert from "node:assert/strict";
import test from "node:test";

import { URRIDE_DOCS_ON_FILE } from "./urrideDocsOnFile.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];
const KEYS = Object.keys(URRIDE_DOCS_ON_FILE.en).sort();

test("every locale carries every documents-on-file key with the same placeholders", () => {
  assert.deepEqual(Object.keys(URRIDE_DOCS_ON_FILE).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    const section = URRIDE_DOCS_ON_FILE[locale];
    assert.deepEqual(Object.keys(section).sort(), KEYS, locale);
    for (const key of KEYS) {
      assert.ok(section[key].trim(), `${locale}.${key} is empty`);
      assert.deepEqual(
        (section[key].match(/\{[a-zA-Z]+\}/g) || []).sort(),
        (URRIDE_DOCS_ON_FILE.en[key].match(/\{[a-zA-Z]+\}/g) || []).sort(),
        `${locale}.${key} placeholders`,
      );
    }
  }
});
