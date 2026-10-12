import assert from "node:assert/strict";
import test from "node:test";

import { NATIVE_PUSH_FIX } from "./nativePushFix.js";
import { diagnosticMessage } from "../Backend/services/nativePushLogic.js";

const LOCALES = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];
const placeholders = (text) => (String(text).match(/\{[A-Za-z0-9_]+\}/g) || []).sort();

test("every locale carries every native push key with the same placeholders", () => {
  assert.deepEqual(Object.keys(NATIVE_PUSH_FIX).sort(), [...LOCALES].sort());
  const english = NATIVE_PUSH_FIX.en;
  assert.ok(Object.keys(english).length >= 12);
  for (const locale of LOCALES) {
    const entries = NATIVE_PUSH_FIX[locale];
    assert.deepEqual(Object.keys(entries).sort(), Object.keys(english).sort(), locale);
    for (const [key, value] of Object.entries(english)) {
      assert.equal(typeof entries[key], "string", `${locale}.${key}`);
      assert.ok(entries[key].trim(), `${locale}.${key} is empty`);
      assert.deepEqual(placeholders(entries[key]), placeholders(value), `${locale}.${key} placeholders`);
    }
  }
});

test("translations are translated, not copied from English", () => {
  const english = NATIVE_PUSH_FIX.en;
  for (const locale of LOCALES.filter((code) => code !== "en")) {
    const copied = Object.keys(english).filter((key) => NATIVE_PUSH_FIX[locale][key] === english[key]);
    assert.deepEqual(copied, [], `${locale} copies English`);
  }
});

test("technical names stay as they are in every language", () => {
  for (const locale of LOCALES) {
    const section = NATIVE_PUSH_FIX[locale];
    assert.match(section.iosMissingEntitlement, /aps-environment/, locale);
    assert.match(section.androidMissingFirebase, /google-services\.json/, locale);
    assert.match(section.androidMissingFirebase, /Google[ -]Play/, locale);
    assert.match(section.permissionDeniedIos, /KunThai/, locale);
    assert.match(section.permissionDeniedAndroid, /KunThai/, locale);
  }
});

test("every diagnostic maps to a key that exists", () => {
  const reasons = ["permissionDenied", "signIn", "iosMissingEntitlement", "iosSimulator", "androidMissingFirebase", "timeout", "saveFailed", "registerFailed"];
  for (const reason of reasons) {
    for (const diagnostic of [{ reason, platform: "ios" }, { reason, platform: "android", message: "detail" }]) {
      const { key } = diagnosticMessage(diagnostic);
      assert.equal(typeof NATIVE_PUSH_FIX.en[key], "string", `${reason} -> ${key}`);
    }
  }
});
