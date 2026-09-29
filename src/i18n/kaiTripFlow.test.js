import assert from "node:assert/strict";
import test from "node:test";

import { KAI_TRIP_FLOW_COPY } from "./kaiTripFlow.js";

const placeholders = (text) => (text.match(/\{[A-Za-z0-9_]+\}/g) || []).sort();

test("KAI booking flow has complete copy in all newly added languages", () => {
  const english = KAI_TRIP_FLOW_COPY.en;
  for (const locale of ["id", "ur", "ru", "de", "ja", "mr", "vi"]) {
    const copy = KAI_TRIP_FLOW_COPY[locale];
    assert.ok(copy, `missing KAI copy for ${locale}`);
    assert.deepEqual(Object.keys(copy), Object.keys(english), `${locale} booking keys`);
    for (const [key, source] of Object.entries(english)) {
      assert.ok(copy[key].trim(), `${locale}.${key} is empty`);
      assert.deepEqual(placeholders(copy[key]), placeholders(source), `${locale}.${key} placeholders`);
    }
    assert.notEqual(copy.intro, english.intro, `${locale} intro is untranslated`);
  }
});
