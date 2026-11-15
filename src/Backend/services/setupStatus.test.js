import assert from "node:assert/strict";
import test from "node:test";

import {
  companySetupChecklist,
  isTrustedSetup,
  hasUpload,
  isVerifiedStatus,
  operatorDocumentsComplete,
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
  const empty = operatorSetupChecklist({}, false);
  assert.equal(setupScore(empty), 0);
  assert.deepEqual([...sectionsNeedingAttention(empty)].sort(), ["documents", "fleet", "operator", "service"]);
  const full = operatorSetupChecklist({ name: "A", phone: "1", city: "F", fleetType: "Taxi", plateNumber: "P", make: "M", model: "X", baseFare: "5" }, true);
  assert.equal(setupScore(full), 100);
  assert.equal(sectionsNeedingAttention(full).size, 0);
});

test("company checklist flags only what is missing", () => {
  const documentRequirements = [{ key: "a", legacyLabel: "A" }, { key: "b", legacyLabel: "B" }];
  const list = companySetupChecklist({ company: { companyName: "K", companyType: "t", city: "F", supportPolicy: "p", documents: { A: { path: "x" }, B: "b.pdf" } }, operatingAreas: ["x"], fleetCount: 1, documentRequirements });
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

test("Trusted needs every main document; the optional extras never count", () => {
  const requirements = [{ key: "national_id", label: "National ID" }, { key: "vehicle_registration", label: "Vehicle registration" }];
  // One of two, plus an optional extra: not yet.
  assert.equal(operatorDocumentsComplete({ requirements, uploads: { "doc-national_id": { path: "a" }, "doc-additional-1": { path: "b" } } }), false);
  // Both in, one picked now and one already on file.
  assert.equal(operatorDocumentsComplete({ requirements, uploads: { "doc-national_id": { file: {} } }, onFileByRequirement: { vehicle_registration: {} } }), true);
  // Older drafts keyed by label count too.
  assert.equal(operatorDocumentsComplete({ requirements, uploads: { "doc-National ID": "id.pdf", "doc-vehicle_registration": "v.pdf" } }), true);

  const companyRequirements = [{ key: "a", legacyLabel: "A" }, { key: "b", legacyLabel: "B" }];
  const company = { documents: { A: { path: "x" } } };
  const docs = (list) => list.find((item) => item.id === "documents").complete;
  assert.equal(docs(companySetupChecklist({ company, documentRequirements: companyRequirements })), false);
  assert.equal(docs(companySetupChecklist({ company: { documents: { A: { path: "x" }, B: { fileUrl: "y" } } }, documentRequirements: companyRequirements })), true);
  assert.equal(hasUpload({}), false);
  assert.equal(hasUpload(""), false);
});
