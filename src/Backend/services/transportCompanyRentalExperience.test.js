import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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

test("company dashboard tabs stay in one de-duplicated horizontal rail", () => {
  assert.match(companyWorkspaceSource, /const uniqueTabs = \[\.\.\.new Set\(tabs\)\]/);
  assert.match(companyWorkspaceSource, /flex w-full flex-nowrap gap-2 overflow-x-auto/);
  assert.match(companyWorkspaceSource, /min-w-max flex-none whitespace-nowrap/);
  assert.doesNotMatch(companyWorkspaceSource, /\{tabs\.map\(/);
  assert.doesNotMatch(companyWorkspaceSource, /grid w-full grid-cols-5/);
});

test("passengers can switch directly between live operators and rentals", () => {
  assert.match(nearbyOperatorsSource, /role="tablist" aria-label="Nearby transport category"/);
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
  assert.match(companyRegistrationSource, /rentalSubmission \? "Add rental vehicle"/);
  assert.match(companyRegistrationSource, /rentalSubmission \? "Add rental fleet"/);
});

test("rental saves update the selected company without resetting verification", () => {
  assert.match(companyServiceSource, /const addRentalMode = account\?\.actionMode === "add_rental"/);
  assert.match(companyServiceSource, /normalized\.id \? \{ id: normalized\.id \} : \{ owner_user_id: user\.id \}/);
  assert.match(companyServiceSource, /verification_status: normalized\.verificationStatus \|\| "pending"/);
  assert.match(companyServiceSource, /activity_type: addRentalMode \? "rental_fleet_added"/);
});
