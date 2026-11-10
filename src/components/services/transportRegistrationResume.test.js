import assert from "node:assert/strict";
import test from "node:test";

import { latestSavedRegistration } from "./transportRegistrationResume.js";

test("no draft opens the normal choice", () => {
  assert.equal(latestSavedRegistration(null, null), "");
});

test("a single draft reopens that registration", () => {
  assert.equal(latestSavedRegistration({ savedAt: "2026-11-09T10:00:00Z" }, null), "solo");
  assert.equal(latestSavedRegistration(null, { savedAt: "2026-11-09T10:00:00Z" }), "company");
});

test("with both, the newest save wins", () => {
  const older = { savedAt: "2026-11-08T10:00:00Z" };
  const newer = { savedAt: "2026-11-09T10:00:00Z" };
  assert.equal(latestSavedRegistration(older, newer), "company");
  assert.equal(latestSavedRegistration(newer, older), "solo");
});
