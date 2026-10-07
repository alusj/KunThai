import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { UI_TRANSLATIONS } from "../../i18n/ui.js";

const nearbyOperatorsSource = readFileSync(
  new URL("../../components/transport/Body/NearbyOperators.jsx", import.meta.url),
  "utf8",
);
const companyWorkspaceSource = readFileSync(
  new URL("../../components/transport/CompanyWorkspaceScreen.jsx", import.meta.url),
  "utf8",
);
const transportSource = readFileSync(
  new URL("../../components/transport/Transport.jsx", import.meta.url),
  "utf8",
);
const companyRegistrationSource = readFileSync(
  new URL("../../components/transport/registration/CompanyRegistrationScreen.jsx", import.meta.url),
  "utf8",
);
const companyServiceSource = readFileSync(
  new URL("../../components/services/transportCompanyService.js", import.meta.url),
  "utf8",
);
const companyRentalsSource = readFileSync(
  new URL("../../components/transport/rentals/CompanyRentals.jsx", import.meta.url),
  "utf8",
);
const rentalDetailsSource = readFileSync(
  new URL("../../components/transport/rentals/RentalDetailsScreen.jsx", import.meta.url),
  "utf8",
);
const urRideTranslationsSource = readFileSync(
  new URL("../../i18n/urride.js", import.meta.url),
  "utf8",
);
const pricingMigrationSource = readFileSync(
  new URL("../../../supabase/migrations/20260906123000_urride_rental_pricing_and_document_copy.sql", import.meta.url),
  "utf8",
);
const documentRequirementsSource = readFileSync(
  new URL("../../data/globalDocumentRequirements.js", import.meta.url),
  "utf8",
);
const transportCapabilitiesSource = readFileSync(
  new URL("../../data/globalTransportCapabilities.js", import.meta.url),
  "utf8",
);

test("company dashboard tabs stay in one de-duplicated horizontal rail", () => {
  assert.match(companyWorkspaceSource, /const uniqueTabs = \[\.\.\.new Set\(tabs\)\]/);
  assert.match(companyWorkspaceSource, /flex w-full flex-nowrap gap-2 overflow-x-auto/);
  assert.match(companyWorkspaceSource, /min-w-max flex-none whitespace-nowrap/);
  assert.doesNotMatch(companyWorkspaceSource, /\{tabs\.map\(/);
  assert.doesNotMatch(companyWorkspaceSource, /grid w-full grid-cols-5/);
});

test("passengers can switch directly between live operators and rentals", () => {
  assert.match(nearbyOperatorsSource, /role="tablist" aria-label=\{i18nText\("ui\.literals\.kf1213680c4fa"\)\}/);
  assert.equal(UI_TRANSLATIONS.en.literals.kf1213680c4fa, "Nearby transport category");
  assert.match(nearbyOperatorsSource, /setCategory\("operators"\)/);
  assert.match(nearbyOperatorsSource, /setCategory\("rentals"\)/);
  assert.match(nearbyOperatorsSource, /category === "rentals" \? <RentalCatalogue \/>/);
});

test("company rental creation is routed separately from company editing", () => {
  assert.match(companyWorkspaceSource, /onAddFleet=\{canAddRentalFleets \? onAddRentalFleet : undefined\}/);
  assert.match(transportSource, /onAddRentalFleet=\{\(\) => openCompanyRegistration\("company-workspace", "addRental"\)\}/);
  assert.match(transportSource, /completedMode === "addRental"[\s\S]*\? "Rentals" : "Overview"/);
});

test("rental service selection removes operator assignment and uses rental readiness", () => {
  assert.match(companyRegistrationSource, /const addRentalMode = mode === "addRental"/);
  assert.match(companyRegistrationSource, /fleet\.serviceCategory === "Rental" \? rentalReadinessQuestions/);
  assert.match(companyRegistrationSource, /value === "Rental" \? \{ operators: \[\] \} : \{\}/);
  assert.match(companyRegistrationSource, /fleet\.serviceCategory !== "Rental" && <div data-field-error/);
  assert.match(companyRegistrationSource, /actionMode: addingRentalFleet \? "add_rental"/);
  assert.match(companyRegistrationSource, /accountStatus: incrementalFleetMode \? form\.accountStatus \|\| accountStatus : accountStatus/);
  assert.match(companyRegistrationSource, /rentalSubmission \? i18nText\("ui\.literals\.kb883f465c09a"\)/);
  assert.equal(UI_TRANSLATIONS.en.literals.kb883f465c09a, "Add rental vehicle");
  assert.match(companyRegistrationSource, /rentalSubmission \? i18nText\("ui\.literals\.k7af252cec249"\)/);
  assert.equal(UI_TRANSLATIONS.en.literals.k7af252cec249, "Add rental fleet");
});

test("rental saves update the selected company without resetting verification", () => {
  assert.match(companyServiceSource, /const addRentalMode = account\?\.actionMode === "add_rental"/);
  assert.match(companyServiceSource, /savedCompanyId \? \{ id: savedCompanyId \} : \{ owner_user_id: user\.id \}/);
  // A new registration has no database id yet: its local KTC code never reaches the uuid lookups.
  assert.match(companyServiceSource, /const savedCompanyId = UUID_PATTERN\.test\(String\(normalized\.id \|\| ""\)\) \? normalized\.id : ""/);
  assert.match(companyServiceSource, /verification_status: normalized\.verificationStatus \|\| "pending"/);
  assert.match(companyServiceSource, /activity_type: addRentalMode \? "rental_fleet_added"/);
  assert.match(companyServiceSource, /savedId \? \{ \.\.\.fleet, id: savedId, localId: savedId \} : fleet/);
});

test("rental and operator fleet forms include the general Vehicle / Car type", () => {
  assert.match(transportCapabilitiesSource, /COMPANY_FLEET_ORDER = \[[^\]]*"Vehicle \/ Car"/);
  assert.match(transportCapabilitiesSource, /source\.some\(\(option\) => option\.value === "Car"\)[^\n]*values\.push\("Vehicle \/ Car"\)/);
  assert.match(transportCapabilitiesSource, /"vehicle \/ car", "vehicle\/car"/);
  assert.match(companyRegistrationSource, /serviceCategory === "Rental" && fleetTypes\.includes\("Vehicle \/ Car"\)/);
});

test("rental pricing supports fixed or negotiable time and distance choices", () => {
  assert.match(companyRegistrationSource, /rentalDistanceNegotiable/);
  assert.match(companyRegistrationSource, /rentalTimeNegotiable/);
  assert.match(companyRentalsSource, /checked=\{timeNegotiable\} label=\{i18nText\("ui\.literals\.kb3e010f98913"\)\}/);
  assert.equal(UI_TRANSLATIONS.en.literals.kb3e010f98913, "Time price is negotiable");
  assert.match(companyRentalsSource, /checked=\{distanceNegotiable\} label=\{i18nText\("ui\.literals\.k3bbb577489a7"\)\}/);
  assert.equal(UI_TRANSLATIONS.en.literals.k3bbb577489a7, "Distance price is negotiable");
  assert.match(rentalDetailsSource, /i18nText\("ui\.literals\.kf95f3ec42978"\)/);
  assert.equal(UI_TRANSLATIONS.en.literals.kf95f3ec42978, "Pricing is arranged with the company. Send your preferred dates; the company will confirm the price before the rental is reserved.");
  assert.match(pricingMigrationSource, /add column if not exists distance_rate numeric\(14,2\)/i);
  assert.match(pricingMigrationSource, /add column if not exists time_negotiable boolean/i);
  assert.match(pricingMigrationSource, /add column if not exists distance_negotiable boolean/i);
  assert.match(pricingMigrationSource, /fixed or negotiable rental price/i);
});

test("UrMall and UrRide document prompts say if available", () => {
  assert.match(documentRequirementsSource, /IF_APPLICABLE_NOTE = "if available"/);
  assert.match(documentRequirementsSource, /URRIDE_COMPANY_DOCUMENT_REQUIREMENTS/);
  assert.match(documentRequirementsSource, /URMALL_DOCUMENT_REQUIREMENTS/);
  assert.doesNotMatch(urRideTranslationsSource, /if applicable/i);
  assert.match(pricingMigrationSource, /inline_note = 'if available'/i);
});
