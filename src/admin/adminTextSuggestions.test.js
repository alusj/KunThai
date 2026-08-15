import test from "node:test";
import assert from "node:assert/strict";
import {
  INTERNAL_NOTE_SUGGESTIONS,
  NOTIFICATION_MESSAGE_SUGGESTIONS,
  NOTIFICATION_TITLE_SUGGESTIONS,
  applyCaseContext,
  getDecisionReasonSuggestions,
} from "./adminTextSuggestions.js";

const DECISIONS = ["approve", "reject", "dismiss", "remove", "restrict", "suspend", "resolve", "request_information"];

test("every case decision has a useful editable suggestion set", () => {
  DECISIONS.forEach((decision) => {
    const suggestions = getDecisionReasonSuggestions(decision);
    assert.ok(suggestions.length >= 5, `${decision} should have at least five suggestions`);
    suggestions.forEach((item) => {
      assert.ok(item.id);
      assert.ok(item.label.length >= 8);
      assert.ok(item.text.length >= 80);
    });
  });
});

test("notes and notification fields have broad suggestion libraries", () => {
  assert.ok(INTERNAL_NOTE_SUGGESTIONS.length >= 10);
  assert.ok(NOTIFICATION_TITLE_SUGGESTIONS.length >= 10);
  assert.ok(NOTIFICATION_MESSAGE_SUGGESTIONS.length >= 10);
});

test("case context placeholders remain editable and are resolved safely", () => {
  assert.equal(
    applyCaseContext("Review [case number]: [case title]", { case_number: 42, title: "Identity review" }),
    "Review KT-000042: Identity review",
  );
  assert.equal(
    applyCaseContext("Review [case number]", {}),
    "Review the current case",
  );
});

