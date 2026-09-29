import assert from "node:assert/strict";
import test from "node:test";

import { KAI_FORM_GUIDE_COPY } from "./kaiFormGuide.js";

const placeholders = (text) => (text.match(/\{[A-Za-z0-9_]+\}/g) || []).sort();

test("KAI form guide has complete copy in every selectable language", () => {
  const english = KAI_FORM_GUIDE_COPY.en;
  for (const locale of ["fr", "ar", "es", "zh", "hi", "bn", "pt", "id", "ur", "ru", "de", "ja", "mr", "vi"]) {
    const copy = KAI_FORM_GUIDE_COPY[locale];
    assert.ok(copy, `missing KAI form copy for ${locale}`);
    assert.deepEqual(Object.keys(copy), Object.keys(english), `${locale} form keys`);
    for (const [key, source] of Object.entries(english)) {
      assert.ok(copy[key].trim(), `${locale}.${key} is empty`);
      assert.deepEqual(placeholders(copy[key]), placeholders(source), `${locale}.${key} placeholders`);
    }
  }
});
