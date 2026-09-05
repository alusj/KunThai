import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { shouldOpenAddressAccuracyCaution } from "../../components/shared/addressAccuracyCautionState.js";

const cautionSource = readFileSync(new URL("../../components/shared/AddressAreaValidation.jsx", import.meta.url), "utf8");
const locationStepSource = readFileSync(new URL("../../components/Marketplace/MarketplaceHeader/Business/BusinessRegistration/LocationContactStep.jsx", import.meta.url), "utf8");
const appearanceSource = readFileSync(new URL("../../styles/appearance.css", import.meta.url), "utf8");
const translationsSource = readFileSync(new URL("../../i18n/translations.js", import.meta.url), "utf8");

test("the accuracy caution opens as soon as the user starts entering an address", () => {
  assert.equal(shouldOpenAddressAccuracyCaution({ address: "J", previousAddress: "" }), true);
  assert.equal(shouldOpenAddressAccuracyCaution({ address: "Juba", previousAddress: "J" }), true);
});

test("an unchanged or empty initial address does not open the accuracy caution", () => {
  assert.equal(shouldOpenAddressAccuracyCaution({ address: "", previousAddress: "" }), false);
  assert.equal(shouldOpenAddressAccuracyCaution({ address: "Juba", previousAddress: "Juba" }), false);
});

test("continue writing or a precise-location action suppresses the caution", () => {
  assert.equal(shouldOpenAddressAccuracyCaution({
    address: "Juba Hill",
    previousAddress: "Juba",
    dismissed: true,
  }), false);
});

test("the floating caution exposes all three address choices and expandable guidance", () => {
  assert.match(cautionSource, /onLocateMe/);
  assert.match(cautionSource, /onDropPin/);
  assert.match(cautionSource, /onContinueWriting/);
  assert.match(cautionSource, /aria-expanded=\{expanded\}/);
  assert.match(locationStepSource, /accuracyContinueWriting/);
  assert.match(locationStepSource, /addressInputRef\.current\?\.focus\(\)/);
});

test("the caution is anchored immediately above its address field instead of the viewport bottom", () => {
  assert.match(cautionSource, /absolute bottom-\[calc\(100%\+0\.75rem\)\]/);
  assert.doesNotMatch(cautionSource, /fixed bottom-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/);
  assert.match(locationStepSource, /<div className="relative">\s*<RegistrationField[\s\S]*?<AddressAccuracyCaution/);
});

test("address cards, inputs, and the floating caution have explicit dark-mode contrast", () => {
  assert.match(locationStepSource, /kt-address-entry-card/);
  assert.match(appearanceSource, /html\.dark \.kt-address-entry-card/);
  assert.match(appearanceSource, /html\.dark \.kt-registration-input/);
  assert.match(appearanceSource, /html\.dark \.kt-address-accuracy-caution/);
});

test("every supported language includes the expanded accuracy guidance and actions", () => {
  assert.equal((translationsSource.match(/accuracyDetails:/g) || []).length, 5);
  assert.equal((translationsSource.match(/accuracyContinueWriting:/g) || []).length, 5);
  assert.equal((translationsSource.match(/accuracyReadMore:/g) || []).length, 5);
});
