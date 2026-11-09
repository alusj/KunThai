import assert from "node:assert/strict";
import test from "node:test";

import {
  companySetupChecklist,
  isTrustedSetup,
  isVerifiedStatus,
  operatorSetupChecklist,
  sectionsNeedingAttention,
  sellerSectionsNeedingAttention,
  setupScore,
} from "./setupStatus.js";

test("each missing store item points at its editor section", () => {
  const sections = sellerSectionsNeedingAttention([
    { key: "logo", complete: false },
    { key: "phone", complete: true },
    { key: "open-time", complete: false },
    { key: "document-national_id", complete: false },
  ]);
  assert.deepEqual([...sections].sort(), ["identity", "operations", "trustPayout"]);
  assert.equal(sellerSectionsNeedingAttention([{ key: "logo", complete: true }]).size, 0);
});

test("operator checklist drives the score and the sections", () => {
  const empty = operatorSetupChecklist({}, true);
  assert.equal(setupScore(empty), 0);
  assert.deepEqual([...sectionsNeedingAttention(empty)].sort(), ["documents", "fleet", "operator", "service"]);
  const full = operatorSetupChecklist({ name: "A", phone: "1", city: "F", fleetType: "Taxi", plateNumber: "P", make: "M", model: "X", baseFare: "5" }, false);
  assert.equal(setupScore(full), 100);
  assert.equal(sectionsNeedingAttention(full).size, 0);
});

test("company checklist flags only what is missing", () => {
  const list = companySetupChecklist({ company: { companyName: "K", companyType: "t", city: "F", supportPolicy: "p", documents: { a: 1 } }, operatingAreas: ["x"], fleetCount: 1 });
  assert.deepEqual([...sectionsNeedingAttention(list)], ["fleets"]);
  assert.equal(setupScore(list), 88);
});

test("Trusted needs a complete setup, not a finished review", () => {
  assert.equal(isTrustedSetup(true, "pending"), true);
  assert.equal(isTrustedSetup(true, "verified"), true);
  assert.equal(isTrustedSetup(true, ""), true);
  assert.equal(isTrustedSetup(false, "verified"), false);
  assert.equal(isTrustedSetup(true, "Rejected"), false);
  assert.equal(isTrustedSetup(true, "not verified"), false);
  assert.equal(isTrustedSetup(true, "suspended"), false);
  assert.equal(isVerifiedStatus("Verified recommended"), true);
  assert.equal(isVerifiedStatus("pending"), false);
});
