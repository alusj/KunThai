import assert from "node:assert/strict";
import test from "node:test";

import {
  changesSinceLastReview,
  collectSourceDocuments,
  formatWait,
  hasMissingDocuments,
  isContinuingCase,
  isWaitOverdue,
  requestableDocuments,
  sortVerificationQueue,
  stageSince,
  verificationAttentionCount,
  verificationLaneCounts,
  verificationStage,
} from "./verificationStages.js";

const NOW = Date.parse("2026-10-19T12:00:00Z");
const hoursAgo = (hours) => new Date(NOW - hours * 3600 * 1000).toISOString();

test("stages follow the case status and decision", () => {
  assert.equal(verificationStage({ status: "new" }), "new");
  assert.equal(verificationStage({ status: "assigned", assignee_user_id: "a" }), "in_review");
  assert.equal(verificationStage({ status: "new", assignee_user_id: "a" }), "in_review");
  assert.equal(verificationStage({ status: "waiting_information" }), "waiting_on_user");
  assert.equal(verificationStage({ status: "reopened" }), "resubmitted");
  assert.equal(verificationStage({ status: "resolved", resolution_code: "approve" }), "approved");
  assert.equal(verificationStage({ status: "resolved", resolution_code: "approve_recommend" }), "approved");
  assert.equal(verificationStage({ status: "resolved", resolution_code: "reject" }), "rejected");
  assert.equal(verificationStage({ status: "closed", resolution_code: "merged_into_registration" }), "closed");
});

test("a resubmission nobody has picked up stays resubmitted", () => {
  const item = { status: "triaged", resubmitted_at: hoursAgo(1), last_reviewed_at: hoursAgo(5) };
  assert.equal(verificationStage(item), "resubmitted");
  assert.equal(verificationStage({ ...item, assignee_user_id: "a" }), "in_review");
});

test("first submissions and continuing cases are told apart", () => {
  assert.equal(isContinuingCase({ status: "new" }), false);
  assert.equal(isContinuingCase({ status: "new", review_round: 1 }), false);
  assert.equal(isContinuingCase({ status: "reopened", review_round: 2 }), true);
  assert.equal(isContinuingCase({ status: "waiting_information", info_requested_at: hoursAgo(2) }), true);
});

test("the wait is measured from when the case entered its stage", () => {
  assert.equal(stageSince({ status: "new", created_at: "c" }), "c");
  assert.equal(stageSince({ status: "reopened", created_at: "c", resubmitted_at: "r" }), "r");
  assert.equal(stageSince({ status: "waiting_information", created_at: "c", info_requested_at: "i" }), "i");
  assert.equal(isWaitOverdue({ status: "new", created_at: hoursAgo(30) }, NOW), true);
  assert.equal(isWaitOverdue({ status: "new", created_at: hoursAgo(3) }, NOW), false);
  assert.equal(isWaitOverdue({ status: "waiting_information", info_requested_at: hoursAgo(30) }, NOW), false);
  assert.equal(isWaitOverdue({ status: "resolved", resolution_code: "approve", created_at: hoursAgo(300) }, NOW), false);
  assert.equal(formatWait(5 * 60000), "5 min");
  assert.equal(formatWait(5 * 3600000), "5 h");
  assert.equal(formatWait(72 * 3600000), "3 d");
});

test("queue order: resubmitted, new, in review, waiting, decided; oldest wait first", () => {
  const cases = [
    { id: "decided", status: "resolved", resolution_code: "approve", resolved_at: hoursAgo(1) },
    { id: "waiting", status: "waiting_information", info_requested_at: hoursAgo(50) },
    { id: "new-recent", status: "new", created_at: hoursAgo(1) },
    { id: "new-old", status: "new", created_at: hoursAgo(20) },
    { id: "review", status: "assigned", assignee_user_id: "a", assigned_at: hoursAgo(2) },
    { id: "resub", status: "reopened", resubmitted_at: hoursAgo(1) },
  ];
  assert.deepEqual(sortVerificationQueue(cases, NOW).map((item) => item.id), ["resub", "new-old", "new-recent", "review", "waiting", "decided"]);
});

test("lane counts and the nav badge", () => {
  const cases = [
    { queue: "verification", status: "new" },
    { queue: "verification", status: "reopened" },
    { queue: "verification", status: "waiting_information" },
    { queue: "verification", status: "assigned", assignee_user_id: "a" },
    { queue: "verification", status: "resolved", resolution_code: "reject" },
    { queue: "reports", status: "new" },
  ];
  const counts = verificationLaneCounts(cases.filter((item) => item.queue === "verification"));
  assert.equal(counts.needs_review, 3);
  assert.equal(counts.new, 1);
  assert.equal(counts.resubmitted, 1);
  assert.equal(counts.waiting_on_user, 1);
  assert.equal(counts.decided, 1);
  assert.equal(verificationAttentionCount(cases), 2);
});

test("applicants without uploads wait in their own lane until a file arrives", () => {
  const empty = { queue: "verification", status: "new", resource_type: "transport_operator_verification", metadata: { source: { registration_documents: [] } } };
  const uploaded = { ...empty, metadata: { source: { registration_documents: [{ id: "d1", document_type: "National ID", storage_path: "ops/id.jpg" }] } } };
  const company = { ...empty, resource_type: "transport_company_verification", metadata: { source: { documents: { "Transport permit": "" } } } };
  const location = { queue: "verification", status: "new", resource_type: "area_location_verification", metadata: { source: {} } };
  assert.equal(hasMissingDocuments(empty), true);
  assert.equal(hasMissingDocuments(uploaded), false);
  assert.equal(hasMissingDocuments(company), true);
  assert.equal(hasMissingDocuments({ ...company, metadata: { source: { documents: { "Transport permit": "https://x/p.pdf" } } } }), false);
  assert.equal(hasMissingDocuments(location), false);
  const counts = verificationLaneCounts([empty, uploaded, company, location]);
  assert.equal(counts.needs_review, 4);
  assert.equal(counts.with_documents, 2);
  assert.equal(counts.no_documents, 2);
  assert.equal(verificationAttentionCount([empty, uploaded, company, location]), 2);
});

test("documents are read from arrays and label maps", () => {
  const docs = collectSourceDocuments({
    registration_documents: [{ id: "d1", document_type: "National ID" }],
    documents: { "Transport permit": "https://x/permit.pdf" },
    full_name: "Ama",
  });
  assert.deepEqual(docs.map((entry) => entry.document_type), ["National ID", "Transport permit"]);
});

test("changes since the last review list new and replaced documents and edited fields", () => {
  const item = {
    metadata: {
      reviewSnapshot: {
        at: hoursAgo(10),
        decision: "request_information",
        source: {
          city: "Accra",
          updated_at: "old",
          registration_documents: [
            { id: "d1", document_type: "National ID", storage_path: "a/1.jpg" },
            { id: "d2", document_type: "Vehicle registration", storage_path: "a/2.jpg" },
          ],
        },
      },
      source: {
        city: "Kumasi",
        updated_at: "new",
        registration_documents: [
          { id: "d1", document_type: "National ID", storage_path: "a/1.jpg" },
          { id: "d2", document_type: "Vehicle registration", storage_path: "a/2-v2.jpg" },
          { id: "d3", document_type: "Insurance document", storage_path: "a/3.jpg" },
        ],
      },
    },
  };
  const changes = changesSinceLastReview(item);
  assert.equal(changes.hasChanges, true);
  assert.deepEqual(changes.addedDocuments, ["Insurance document"]);
  assert.deepEqual(changes.replacedDocuments, ["Vehicle registration"]);
  assert.deepEqual(changes.changedFields, [{ key: "city", before: "Accra", after: "Kumasi" }]);
  assert.equal(changesSinceLastReview({ metadata: { source: {} } }), null);
});

test("each case type offers documents to ask for", () => {
  assert.ok(requestableDocuments({ resource_type: "transport_company_verification" }).includes("Transport permit"));
  assert.ok(requestableDocuments({ resource_type: "marketplace_business_registration" }).includes("Owner/representative ID"));
  assert.ok(requestableDocuments({ resource_type: "unknown" }).length > 0);
});
