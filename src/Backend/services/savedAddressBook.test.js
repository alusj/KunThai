import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const bookSource = read("components/shared/savedAddresses/SavedAddressBook.jsx");
const suggestionsSource = read("components/shared/savedAddresses/SavedAddressSuggestions.jsx");
const cautionSource = read("components/shared/AddressAreaValidation.jsx");
const urmallMenuSource = read("components/Marketplace/MarketplaceHeader/Menu/MenuDrawer.jsx");
const urrideMenuSource = read("components/transport/header/TransportMenuDrawer.jsx");
const orderSource = read("components/Marketplace/Browse/ProductDetailDrawer.jsx");
const bookingSource = read("components/transport/booking/TransportBookingDrawer.jsx");
const addressFieldSource = read("components/shared/AddressLocationField.jsx");
const registrationSource = read("components/Marketplace/MarketplaceHeader/Business/BusinessRegistration/LocationContactStep.jsx");
const transportServiceSource = read("components/services/passengerTransportService.js");
const buyerPreferencesSource = read("components/Marketplace/shared/buyerAddressPreferences.js");
const addressBookLocales = read("i18n/addressBook.js");

test("UrMall delivery addresses and UrRide saved places render the same address book", () => {
  for (const source of [urmallMenuSource, urrideMenuSource]) {
    assert.match(source, /import SavedAddressBook from "[./]+shared\/savedAddresses\/SavedAddressBook"/);
    assert.match(source, /<SavedAddressBook\b/);
    // Neither screen keeps a form of its own any more.
    assert.doesNotMatch(source, /handleFrontPictureChange|<AddressAreaResolutionCard/);
  }
});

test("the caution card has no border and stacks Locate me, Drop a pin, Enter manually", () => {
  const card = cautionSource.slice(cautionSource.indexOf("export function AddressAccuracyCaution"), cautionSource.indexOf("export function AddressAreaStatusIcon"));
  assert.doesNotMatch(card.match(/kt-address-accuracy-caution \$\{placement\}[^`]*/)[0], /\bborder\b/);
  assert.match(card, /kt-address-caution-actions mt-4 grid grid-cols-1 gap-2/);
  const order = ["onClick={onLocateMe}", "onClick={onDropPin}", "onClick={onContinueWriting}"].map((needle) => card.indexOf(needle));
  assert.ok(order.every((index) => index > 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test("every address field waits for the first character, then covers itself with the caution", () => {
  for (const source of [bookSource, orderSource, bookingSource, addressFieldSource, registrationSource]) {
    assert.match(source, /useAddressAccuracyCaution\([^)]*\{ gate: false, lockOnEdit: true \}\)/);
    assert.match(source, /<AddressAccuracyCaution\s*\n\s*cover\n/);
    assert.match(source, /guardChange\(/);
  }
});

test("saving animates, then closes the form, toasts and shows the location in the list", () => {
  assert.match(bookSource, /setSaveState\("saving"\)[\s\S]*?setSaveState\("saved"\)[\s\S]*?result\?\.finish\?\.\(\)/);
  assert.match(bookSource, /kt-address-saving-pin/);
  assert.match(bookSource, /kt-address-saved-pop/);
  // The saved list is applied only once the "saved" state has shown.
  assert.match(bookSource, /finish\(\) \{\s*result\?\.apply\?\.\(\);\s*setForm\(null\);/);
  assert.match(bookSource, /showToast\(editing \? t\("addressBook\.toastUpdated"\) : t\("addressBook\.toastSaved"\), "success"\)/);
  // The add button is what returns after a save ("Add another location").
  assert.match(bookSource, /addresses\.length \? t\("addressBook\.addAnother"\) : t\("addressBook\.addFirst"\)/);
});

test("front pictures are compressed so they cannot overflow device storage", () => {
  assert.match(bookSource, /compressAddressPhoto\(file\)/);
  assert.doesNotMatch(bookSource, /readAsDataURL/);
  // A refused write never aborts the save: it is retried without pictures.
  assert.match(transportServiceSource, /function writeLocalJson[\s\S]*?try \{[\s\S]*?return true;[\s\S]*?\} catch \{\s*return false;/);
  assert.match(transportServiceSource, /function writeSavedPlacesLocal[\s\S]*?frontPictureUrl: ""/);
  assert.match(buyerPreferencesSource, /frontPictureUrl: ""/);
});

test("reaching an order or booking address field pops the saved locations", () => {
  assert.match(suggestionsSource, /max-h-\[7\.6rem\] overflow-y-auto/);
  assert.match(orderSource, /<SavedAddressSuggestions[\s\S]*?addresses=\{savedAddresses\}/);
  // Pickup and drop-off both receive the passenger's saved places.
  assert.equal((bookingSource.match(/savedPlaces=\{savedPlaces\}/g) || []).length, 2);
  assert.match(bookingSource, /<SavedAddressSuggestions[\s\S]*?addresses=\{savedPlaces\}/);
});

test("every language has the same saved-location copy", () => {
  const locales = ["en", "fr", "es", "zh", "ar"];
  const counts = locales.map((locale) => {
    const start = addressBookLocales.indexOf(`  ${locale}: {`);
    const next = locales.map((other) => addressBookLocales.indexOf(`  ${other}: {`)).filter((index) => index > start).sort((a, b) => a - b)[0];
    return (addressBookLocales.slice(start, next ?? addressBookLocales.length).match(/^\s{4,6}[\w"][\w "]*"?: /gm) || []).length;
  });
  assert.ok(counts[0] > 40);
  assert.deepEqual(new Set(counts).size, 1, `key counts differ: ${counts.join(", ")}`);
});
