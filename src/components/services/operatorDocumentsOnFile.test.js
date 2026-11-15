import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";

import { documentRequirementKey, LICENCE_REQUIREMENT_KEY, OPERATOR_DOCUMENT_LABELS, summarizeDocumentsOnFile } from "./operatorDocumentsOnFile.js";

test("the label list matches the registration document requirements", () => {
  const source = readFileSync(new URL("../../data/globalDocumentRequirements.js", import.meta.url), "utf8");
  const start = source.indexOf("export const URRIDE_DOCUMENT_REQUIREMENTS");
  const block = source.slice(start, source.indexOf("]);", start));
  const keys = [...block.matchAll(/key: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(OPERATOR_DOCUMENT_LABELS.map(([key]) => key), keys);
  for (const [, label] of OPERATOR_DOCUMENT_LABELS) assert.ok(block.includes(`label: "${label}"`), label);
});

test("a licence given on a company invitation answers the solo licence requirement", () => {
  assert.equal(documentRequirementKey({ document_type: "Permis de conduire", metadata: { fieldKey: "license" } }), LICENCE_REQUIREMENT_KEY);
  assert.equal(documentRequirementKey({ document_type: "Driver or rider license", metadata: { fieldKey: "doc-driver_or_rider_license" } }), LICENCE_REQUIREMENT_KEY);
  assert.equal(documentRequirementKey({ document_type: "Driver or rider license" }), LICENCE_REQUIREMENT_KEY);
  assert.equal(documentRequirementKey({ document_type: "Driving licence", metadata: "{}" }), LICENCE_REQUIREMENT_KEY);
});

test("other registration documents map to their own requirement", () => {
  assert.equal(documentRequirementKey({ document_type: "National ID", metadata: { fieldKey: "doc-national_id" } }), "national_id");
  assert.equal(documentRequirementKey({ document_type: "Insurance document" }), "insurance_document");
  assert.equal(documentRequirementKey({ document_type: "Additional document 1", metadata: { fieldKey: "doc-additional-1" } }), "");
});

test("only documents that are really on file count, and a rejected one is asked for again", () => {
  const summary = summarizeDocumentsOnFile([
    { document_type: "Driver or rider license", file_name: "licence.jpg", status: "verification_pending", uploaded_at: "2026-11-01" },
    { document_type: "National ID", file_name: "id.jpg", status: "rejected" },
    { document_type: "Insurance document", file_name: "", status: "verification_pending" },
  ]);
  assert.equal(summary.licenceOnFile, true);
  assert.equal(summary.count, 1);
  assert.deepEqual(Object.keys(summary.byRequirement), [LICENCE_REQUIREMENT_KEY]);
  assert.equal(summarizeDocumentsOnFile([]).licenceOnFile, false);
  assert.equal(summarizeDocumentsOnFile([{ document_type: "Driver or rider license", file_name: "x.jpg", status: "Rejected" }]).licenceOnFile, false);
});
