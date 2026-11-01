import assert from "node:assert/strict";
import test from "node:test";

import { URRIDE_COMPANY_ALERTS } from "./urrideCompanyAlerts.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];
const KEYS = Object.keys(URRIDE_COMPANY_ALERTS.en).sort();

test("every locale carries the new-bookings alert switch", () => {
  assert.deepEqual(Object.keys(URRIDE_COMPANY_ALERTS).sort(), [...LOCALES].sort());
  for (const locale of LOCALES) {
    const section = URRIDE_COMPANY_ALERTS[locale];
    assert.deepEqual(Object.keys(section).sort(), KEYS, locale);
    for (const [key, value] of Object.entries(section)) assert.ok(value.trim(), `${locale}.${key} is empty`);
    if (locale !== "en") {
      for (const key of KEYS) assert.notEqual(section[key], URRIDE_COMPANY_ALERTS.en[key], `${locale}.${key} copies English`);
    }
  }
});
