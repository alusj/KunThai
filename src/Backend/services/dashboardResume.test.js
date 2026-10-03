import assert from "node:assert/strict";
import test from "node:test";

import {
  DASHBOARD_RESUME_AFTER_MS,
  holdDashboardResume,
  isDashboardResumeHeld,
  resolveResumeDashboard,
  shouldResetToDashboard,
} from "./dashboardResume.js";

const MINUTE = 60 * 1000;

test("15 minutes or more in the background resets to a dashboard; less keeps the screen", () => {
  assert.equal(DASHBOARD_RESUME_AFTER_MS, 15 * MINUTE);
  assert.equal(shouldResetToDashboard(14 * MINUTE, { held: false }), false);
  assert.equal(shouldResetToDashboard(15 * MINUTE, { held: false }), true);
  assert.equal(shouldResetToDashboard(3 * 60 * MINUTE, { held: false }), true);
  assert.equal(shouldResetToDashboard(Number.NaN, { held: false }), false);
});

test("live trips and navigation hold the reset off until they end", () => {
  assert.equal(isDashboardResumeHeld(), false);
  const releaseTrip = holdDashboardResume("operator-active-trip");
  const releaseNav = holdDashboardResume("area-view-navigation");
  assert.equal(shouldResetToDashboard(60 * MINUTE), false);
  releaseTrip();
  assert.equal(isDashboardResumeHeld(), true);
  releaseNav();
  assert.equal(isDashboardResumeHeld(), false);
  assert.equal(shouldResetToDashboard(60 * MINUTE), true);
});

test("the dashboard is the explicit default, else the onboarding choice, else Explore", () => {
  assert.equal(resolveResumeDashboard({ explicitDefault: "transport", primarySurface: "marketplace" }), "transport");
  assert.equal(resolveResumeDashboard({ explicitDefault: "", primarySurface: "marketplace" }), "marketplace");
  assert.equal(resolveResumeDashboard({ primarySurface: "urmall" }), "marketplace");
  assert.equal(resolveResumeDashboard({ primarySurface: "urride" }), "transport");
  assert.equal(resolveResumeDashboard({ explicitDefault: "settings", primarySurface: "messages" }), "explore");
  assert.equal(resolveResumeDashboard(), "explore");
});
