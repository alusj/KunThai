import assert from "node:assert/strict";
import test from "node:test";

import { ACCOUNT_RECOVERY } from "./accountRecovery.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];
const KEYS = Object.keys(ACCOUNT_RECOVERY.en).sort();

test("every locale carries every account recovery key", () => {
  assert.deepEqual(Object.keys(ACCOUNT_RECOVERY).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    const section = ACCOUNT_RECOVERY[locale];
    assert.deepEqual(Object.keys(section).sort(), KEYS, locale);
    for (const [key, value] of Object.entries(section)) assert.ok(value.trim(), `${locale}.${key} is empty`);
    if (locale !== "en") {
      for (const key of ["backupTitle", "backupIntro", "gateUseBackup", "linkEmailTitle"]) {
        assert.notEqual(section[key], ACCOUNT_RECOVERY.en[key], `${locale}.${key} copies English`);
      }
    }
  }
});

test("placeholders survive translation", () => {
  for (const locale of LOCALES) {
    assert.match(ACCOUNT_RECOVERY[locale].remaining, /\{n\}/, `${locale}.remaining`);
    for (const key of ["linkEmailBody", "linkEmailSent"]) assert.match(ACCOUNT_RECOVERY[locale][key], /\{email\}/, `${locale}.${key}`);
  }
});
