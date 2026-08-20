import assert from "node:assert/strict";
import test from "node:test";

import { isStartupDestinationReady } from "./startupRevealService.js";

const returningAccount = {
  activePageReady: true,
  authLoading: false,
  guestSession: false,
  hasUser: true,
  onboardingChecked: true,
  onboardingComplete: true,
  onboardingLoading: false,
  twoFactorChallengeRequired: false,
  twoFactorPassed: true,
};

test("keeps Login hidden until session restoration has definitively completed", () => {
  assert.equal(isStartupDestinationReady({ authLoading: true, hasUser: false }), false);
  assert.equal(isStartupDestinationReady({ authLoading: false, hasUser: false }), true);
});

test("keeps onboarding and dashboard skeletons hidden while account state resolves", () => {
  assert.equal(isStartupDestinationReady({ ...returningAccount, onboardingChecked: false }), false);
  assert.equal(isStartupDestinationReady({ ...returningAccount, onboardingLoading: true }), false);
  assert.equal(isStartupDestinationReady({ ...returningAccount, activePageReady: false }), false);
});

test("reveals only stable authenticated destinations", () => {
  assert.equal(isStartupDestinationReady(returningAccount), true);
  assert.equal(
    isStartupDestinationReady({
      ...returningAccount,
      onboardingComplete: false,
    }),
    true,
  );
  assert.equal(
    isStartupDestinationReady({
      ...returningAccount,
      twoFactorChallengeRequired: true,
      twoFactorPassed: false,
    }),
    true,
  );
});

test("waits for the active dashboard before revealing a guest visit", () => {
  assert.equal(
    isStartupDestinationReady({ authLoading: false, hasUser: true, guestSession: true }),
    false,
  );
  assert.equal(
    isStartupDestinationReady({
      activePageReady: true,
      authLoading: false,
      hasUser: true,
      guestSession: true,
    }),
    true,
  );
});
