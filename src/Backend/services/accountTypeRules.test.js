import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { accountTypeOfUser, canRegisterBusinesses, normalizeAccountType, personalSwitchBlocked } from "./accountTypeRules.js";

test("unknown or missing account types count as Personal", () => {
  assert.equal(normalizeAccountType(""), "personal");
  assert.equal(normalizeAccountType("Admin"), "personal");
  assert.equal(normalizeAccountType(" Business "), "business");
  assert.equal(accountTypeOfUser({ user_metadata: {} }), "personal");
  assert.equal(accountTypeOfUser({ user_metadata: { account_type: "both" } }), "both");
});

test("only Business and Both may register on UrMall and UrRide", () => {
  assert.equal(canRegisterBusinesses("personal"), false);
  assert.equal(canRegisterBusinesses("business"), true);
  assert.equal(canRegisterBusinesses("both"), true);
});

test("Personal is refused while UrMall or UrRide accounts remain", () => {
  assert.equal(personalSwitchBlocked({ urmall: false, urride: false }), false);
  assert.equal(personalSwitchBlocked({ urmall: true, urride: false }), true);
  assert.equal(personalSwitchBlocked({ urmall: false, urride: true }), true);
});

test("registration entry points are gated by account type", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const urmallHeader = read("../../components/Marketplace/MarketplaceHeader/MarketplaceHeader.jsx");
  const urmallWorkspace = read("../../components/Marketplace/MarketplaceHeader/Business/Business.jsx");
  const urride = read("../../components/transport/Transport.jsx");
  assert.match(urmallHeader, /canRegister/);
  assert.match(urmallWorkspace, /onAddBusiness=\{canRegister \? addAnotherBusiness : undefined\}/);
  assert.match(urmallWorkspace, /BusinessAccountRequired/);
  for (const opener of ["openRegistrationChooser", "openSoloRegistration", "openCompanyRegistration"]) {
    assert.match(urride, new RegExp(`function ${opener}\\([^)]*\\) \\{\\s*if \\(registrationBlocked\\(`), `${opener} is gated`);
  }
});
