import assert from "node:assert/strict";
import test from "node:test";

import { MESSAGE_ACTIONS } from "./messageActions.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];
const KEYS = Object.keys(MESSAGE_ACTIONS.en).sort();

test("every locale carries every message-action key", () => {
  assert.deepEqual(Object.keys(MESSAGE_ACTIONS).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    const section = MESSAGE_ACTIONS[locale];
    assert.deepEqual(Object.keys(section).sort(), KEYS, locale);
    for (const [key, value] of Object.entries(section)) assert.ok(value.trim(), `${locale}.${key} is empty`);
    if (locale !== "en") {
      for (const key of ["reply", "deleteForEveryone", "deleteTitle", "deleted", "editExpired"]) {
        assert.notEqual(section[key], MESSAGE_ACTIONS.en[key], `${locale}.${key} copies English`);
      }
    }
  }
});

test("the reply banner keeps its {name}", () => {
  for (const locale of LOCALES) {
    assert.match(MESSAGE_ACTIONS[locale].replyingTo, /\{name\}/, locale);
  }
});
