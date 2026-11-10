import assert from "node:assert/strict";
import test from "node:test";

import { LOCATION_REQUEST_REPLY } from "./locationRequestReply.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];
const KEYS = Object.keys(LOCATION_REQUEST_REPLY.en).sort();

test("every locale carries every key, and the decline text names the person", () => {
  assert.deepEqual(Object.keys(LOCATION_REQUEST_REPLY).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(LOCATION_REQUEST_REPLY[locale]).sort(), KEYS, locale);
    assert.ok(LOCATION_REQUEST_REPLY[locale].declinedBody.includes("{name}"), locale);
  }
});
