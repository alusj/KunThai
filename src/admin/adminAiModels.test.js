import assert from "node:assert/strict";
import test from "node:test";

import { auditFacts, campaignsFacts, caseFactsForAi, casesOverviewFacts, platformSummaryFacts, safeCaseMetadata } from "./adminAiModels.js";

const NOW = Date.UTC(2026, 8, 17, 12);
const hoursAgo = (hours) => new Date(NOW - hours * 36e5).toISOString();

const CASES = [
  {
    id: "c1", case_number: 1125, sector: "transport", queue: "support", case_type: "trip_support", status: "assigned", priority: "high",
    title: "Fare dispute after completed trip", description: "Passenger says the final fare did not match the estimate.",
    assignee_user_id: "support-user", subject_user_id: "user-9", created_at: hoursAgo(14), sla_due_at: hoursAgo(1),
    metadata: { source: { passenger_name: "Aminata Jalloh", phone: "+23276123456", email: "a@example.com", topic: "Fare dispute", country_iso: "GH", trip_id: "KT-TRIP-921" } },
  },
  {
    id: "c2", sector: "explore", queue: "reports", case_type: "content_report", status: "new", priority: "critical",
    title: "Reported Swip video", description: "Threatening language.", created_at: hoursAgo(200),
    metadata: { source: { reason: "Threatening language", report_count: 6, author_name: "Someone" } },
  },
  { id: "c3", sector: "marketplace", queue: "support", status: "resolved", priority: "normal", title: "Resolved", created_at: hoursAgo(3) },
];

test("case metadata passes an allow-list: no names, phones, emails or user ids", () => {
  assert.deepEqual(safeCaseMetadata(CASES[0].metadata), { topic: "Fare dispute", country_iso: "GH", trip_id: "KT-TRIP-921" });
  const facts = caseFactsForAi(CASES[0], { notes: [{ body: "Called the operator.", created_at: hoursAgo(2) }] }, { now: NOW });
  const json = JSON.stringify(facts);
  for (const secret of ["Aminata", "+23276", "a@example.com", "user-9", "support-user"]) {
    assert.ok(!json.includes(secret), `${secret} must not reach the model`);
  }
  assert.equal(facts.overdue, true);
  assert.equal(facts.assigned, true);
  assert.equal(facts.internalNotes[0].text, "Called the operator.");
});

test("case patterns are counted deterministically", () => {
  const open = casesOverviewFacts(CASES, { status: "open", now: NOW });
  assert.equal(open.total, 2);
  assert.equal(open.overdue, 1);
  assert.equal(open.unassigned, 1);
  assert.equal(open.createdLast24Hours, 1);
  assert.equal(open.createdLast7Days, 1);
  assert.deepEqual(open.bySector, { transport: 1, explore: 1 });
  assert.equal(open.recent[1].reason, "Threatening language");
  assert.ok(!JSON.stringify(open).includes("Someone"));

  assert.equal(casesOverviewFacts(CASES, { status: "resolved", now: NOW }).total, 1);
  assert.equal(casesOverviewFacts(CASES, { status: "all", queue: "support", now: NOW }).total, 2);
});

test("summary, campaign and audit facts tolerate both key styles and drop admin identities", () => {
  assert.equal(platformSummaryFacts({ open_cases: 4, urgent_cases: 1 }).openCases, 4);
  assert.match(platformSummaryFacts(null).error, /not available/);
  assert.deepEqual(campaignsFacts([{ title: "Notice", status: "scheduled" }, { title: "Done", status: "completed" }]).byStatus, { scheduled: 1, completed: 1 });
  const audit = auditFacts([{ action_key: "case.decision_applied", sector: "explore", actor_email: "chief@kunthai.app", actor_user_id: "u1", created_at: hoursAgo(1) }], { now: NOW });
  assert.equal(audit.byAction["case.decision_applied"], 1);
  assert.ok(!JSON.stringify(audit).includes("chief@kunthai.app"));
});
