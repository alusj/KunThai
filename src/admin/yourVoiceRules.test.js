import assert from "node:assert/strict";
import test from "node:test";

import { countYourVoice, filterYourVoice, yourVoiceAttentionCount } from "./yourVoiceRules.js";

const rows = [
  { id: "1", feedback_type: "safety", category: "transport", title: "Driver went off route", status: "submitted", admin_seen: false, display_name: "Ama" },
  { id: "2", feedback_type: "idea", category: "explore", title: "Dark mode", message: "Please add it", status: "under_review", admin_seen: true },
  { id: "3", feedback_type: "bug", category: "marketplace", title: "Cart empties", status: "fixed", admin_seen: true },
  { id: "4", feedback_type: "safety", category: "account", title: "Old concern", status: "closed", admin_seen: true },
];

test("Your Voice counts split new, open, unseen and open safety feedback", () => {
  assert.deepEqual(countYourVoice(rows), { total: 4, open: 2, newFeedback: 1, underReview: 1, planned: 0, unseen: 1, openSafety: 1 });
});

test("Your Voice filters by type, status and search text", () => {
  assert.deepEqual(filterYourVoice(rows).map((row) => row.id), ["1", "2"]);
  assert.deepEqual(filterYourVoice(rows, { status: "all", type: "safety" }).map((row) => row.id), ["1", "4"]);
  assert.deepEqual(filterYourVoice(rows, { status: "fixed" }).map((row) => row.id), ["3"]);
  assert.deepEqual(filterYourVoice(rows, { status: "all", search: "please" }).map((row) => row.id), ["2"]);
  assert.deepEqual(filterYourVoice(rows, { search: "ama" }).map((row) => row.id), ["1"]);
});

test("the sidebar badge counts only open Your Voice cases", () => {
  const cases = [
    { case_type: "user_voice", status: "new" },
    { resource_type: "user_care_feedback", status: "in_review" },
    { case_type: "user_voice", status: "resolved" },
    { case_type: "report", status: "new" },
  ];
  assert.equal(yourVoiceAttentionCount(cases), 2);
});
