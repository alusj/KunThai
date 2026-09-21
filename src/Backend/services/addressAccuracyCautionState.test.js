import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { shouldOpenAddressAccuracyCaution } from "../../components/shared/addressAccuracyCautionState.js";

const cautionSource = readFileSync(new URL("../../components/shared/AddressAreaValidation.jsx", import.meta.url), "utf8");
const locationStepSource = readFileSync(new URL("../../components/Marketplace/MarketplaceHeader/Business/BusinessRegistration/LocationContactStep.jsx", import.meta.url), "utf8");
const addressFieldSource = readFileSync(new URL("../../components/shared/AddressLocationField.jsx", import.meta.url), "utf8");
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

test("the address field is locked until the person picks one of the three ways to set it", () => {
  // Tapping a locked field raises the caution instead of the keyboard, and
  // nothing can be typed, pasted or dropped into it meanwhile.
  assert.match(cautionSource, /const \[blocked, setBlocked\] = useState\(gate\);/);
  assert.match(cautionSource, /onPointerDown: blockInput,[\s\S]*?onKeyDown: blockInput,[\s\S]*?onPaste: blockInput,[\s\S]*?onDrop: blockInput,/);
  // React's onBeforeInput is synthesised and cannot cancel the native edit.
  assert.doesNotMatch(cautionSource, /onBeforeInput: blockInput/);
  assert.match(cautionSource, /if \(requestEntry\(\)\) event\.currentTarget\.blur\(\);/);
  // All three buttons release the lock: Locate me, Drop a pin, Enter manually.
  assert.match(cautionSource, /function dismiss\(\) \{[\s\S]*?setBlocked\(false\);/);
  assert.match(cautionSource, /function act\(action\) \{[\s\S]*?setBlocked\(false\);/);
  // A required address is still validated: the input is never readOnly.
  assert.doesNotMatch(cautionSource, /readOnly: blocked/);
});

test("every address field in registration goes through the lock", () => {
  assert.equal((locationStepSource.match(/\{\.\.\.accuracyCaution\.inputProps\}/g) || []).length, 2);
  assert.match(addressFieldSource, /\{\.\.\.caution\.inputProps\}/);
  assert.doesNotMatch(locationStepSource, /onBlur=\{accuracyCaution\.handleAddressBlur\}/);
});

test("the caution is anchored to its own address field instead of the viewport bottom", () => {
  assert.match(cautionSource, /absolute bottom-\[calc\(100%\+0\.75rem\)\]/);
  assert.doesNotMatch(cautionSource, /fixed bottom-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/);
  assert.match(locationStepSource, /<div className="relative">\s*<RegistrationField[\s\S]*?<AddressAccuracyCaution/);
});

test("registration waits for the first character, then covers the field it belongs to", () => {
  // Both the main address and every branch address open writable and are taken
  // back on the first character, rather than being locked before any typing.
  assert.equal(
    (locationStepSource.match(/useAddressAccuracyCaution\([^)]*\{ gate: false, lockOnEdit: true \}\)/g) || []).length,
    2,
  );
  // Typing is what raises the caution and closes the field.
  assert.match(cautionSource, /setOpen\(true\);[\s\S]{0,200}?if \(lockOnEdit\) \{\s*blockedRef\.current = true;\s*setBlocked\(true\);\s*fieldRef\.current\?\.blur\(\);/);
  // Clearing the field hands it back, so a second attempt starts writable.
  assert.match(cautionSource, /if \(lockOnEdit\) \{\s*blockedRef\.current = false;\s*setBlocked\(false\);/);
  // Both cautions in registration lay over their field rather than float above it.
  assert.equal((locationStepSource.match(/<AddressAccuracyCaution\s*\n\s*cover\n/g) || []).length, 2);
  assert.match(cautionSource, /cover\s*\n\s*\? "absolute inset-x-0 top-0 min-h-full w-full"/);
});

test("while locked, changes are refused at the model, not only at keydown", () => {
  // Android keyboards, autocomplete and dictation change the value without a
  // cancellable key, so both registration fields also guard their onChange.
  assert.match(cautionSource, /function guardChange\(onChange\) \{[\s\S]*?if \(blockedRef\.current\) return;/);
  assert.equal((locationStepSource.match(/onChange=\{accuracyCaution\.guardChange\(/g) || []).length, 2);
  // Every path that releases the lock also releases the synchronous mirror.
  assert.match(cautionSource, /function dismiss\(\) \{[\s\S]*?blockedRef\.current = false;/);
  assert.match(cautionSource, /function act\(action\) \{[\s\S]*?blockedRef\.current = false;/);
});

test("only the three buttons close the caution — no backdrop, escape or outside click", () => {
  assert.doesNotMatch(cautionSource, /onClickOutside|addEventListener\("keydown"|Escape/);
  // setOpen(false) appears only in the value reset, dismiss() and act().
  assert.equal((cautionSource.match(/setOpen\(false\)/g) || []).length, 3);
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
