import assert from "node:assert/strict";
import test from "node:test";

import {
  RETURNING_USER_INTRO_AWAY_MS,
  shouldShowReturningUserIntro,
} from "./returningUserIntroService.js";

test("new users without previous activity never see the returning-user intro", () => {
  assert.equal(shouldShowReturningUserIntro("new-user", Date.now(), 0), false);
});

test("a brief absence does not show the returning-user intro", () => {
  const now = 1_000_000;
  assert.equal(shouldShowReturningUserIntro("returning-user", now, now - 5 * 60 * 1000), false);
});

test("the returning-user intro appears after the long-away threshold", () => {
  const now = 10_000_000;
  assert.equal(
    shouldShowReturningUserIntro("returning-user", now, now - RETURNING_USER_INTRO_AWAY_MS),
    true,
  );
});
