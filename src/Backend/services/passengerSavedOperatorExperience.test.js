import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const documentRequirements = source("../../data/globalDocumentRequirements.js");
const companyRegistration = source("../../components/transport/registration/CompanyRegistrationScreen.jsx");
const operatorRegistration = source("../../components/transport/registration/FleetRegistrationDrawer.jsx");
const savedOperatorService = source("../../components/services/passengerTransportService.js");
const savedOperatorButton = source("../../components/transport/SaveOperatorButton.jsx");
const tripsScreen = source("../../components/transport/ActiveTripsScreen.jsx");
const onboardingService = source("./onboardingService.js");
const migration = source("../../../supabase/migrations/20260907110000_urride_saved_operators_required_media_and_phone.sql");

test("fleet images are mandatory while verification documents remain optional", () => {
  assert.match(documentRequirements, /front_view[\s\S]*inlineNote: ""[\s\S]*required: true/);
  assert.match(documentRequirements, /URRIDE_DOCUMENT_REQUIREMENTS[\s\S]*required: false/);
  assert.match(documentRequirements, /URMALL_DOCUMENT_REQUIREMENTS[\s\S]*required: false/);
  assert.match(operatorRegistration, /fleetImageRequirements\.forEach/);
  assert.doesNotMatch(operatorRegistration, /documents\.forEach\(\(requirement\) => \{\s*if \(!getRequirementUpload\(uploads, "doc"/);
  assert.match(companyRegistration, /getFleetImageRequirements\(form, fleet\)\.forEach/);
  assert.match(migration, /jsonb_array_length[\s\S]*< 4/);
});

test("account phone fallback and passenger-safe fleet contacts are wired", () => {
  assert.match(onboardingService, /metadata\.phone_number \|\| user\?\.phone \|\| ""/);
  assert.match(migration, /get_public_transport_fleet_contacts/);
  assert.match(migration, /raw_user_meta_data->>'phone_number'/);
  assert.match(migration, /transport_operators_phone_required/);
  assert.match(migration, /marketplace_businesses_phone_required/);
});

test("passengers can save and remove operators from persistent storage", () => {
  assert.match(savedOperatorService, /export async function saveTransportOperator/);
  assert.match(savedOperatorService, /onConflict: "passenger_id,fleet_id"/);
  assert.match(savedOperatorService, /export async function removeSavedTransportOperator/);
  assert.match(savedOperatorButton, /urride\.saved\.operatorSaved/);
  assert.match(migration, /create table if not exists public\.transport_saved_operators/);
});

test("Trips separates active trips from trip history and supports saving after completion", () => {
  assert.match(tripsScreen, /\["active", t\("urride\.activeTrips\.activeTab"\)\]/);
  assert.match(tripsScreen, /\["history", t\("urride\.activeTrips\.historyTab"\)\]/);
  assert.match(tripsScreen, /fetchPassengerTrips/);
  assert.match(tripsScreen, /trip\.rawStatus === "completed"/);
  assert.match(tripsScreen, /<SaveOperatorButton fleet=\{trip\.fleet\}/);
});
