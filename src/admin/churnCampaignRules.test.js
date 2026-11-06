import test from "node:test";
import assert from "node:assert/strict";

import { AUDIENCES, HOLDOUT_OPTIONS, campaignProgress, canSendPreview, languageName } from "./churnCampaignRules.js";
import { regionTone } from "./churnRegionRules.js";

test("a campaign can be sent only when someone gets it and it is within the cap", () => {
  assert.equal(canSendPreview(null), false);
  assert.equal(canSendPreview({ targetEstimate: 0, eligible: 0, cap: 5000 }), false);
  assert.equal(canSendPreview({ targetEstimate: 12, eligible: 14, cap: 5000 }), true);
  assert.equal(canSendPreview({ targetEstimate: 4600, eligible: 5100, cap: 5000 }), false);
  assert.deepEqual(AUDIENCES, ["attention", "at_risk", "churned", "at_risk_churned"]);
  assert.equal(HOLDOUT_OPTIONS[0], 10, "10% holdout is the default");
});

test("measuring progress runs to the window, then is final", () => {
  assert.deepEqual(campaignProgress({ daysSinceSend: 0, windowDays: 30 }), { final: false, day: 1, days: 30 });
  assert.deepEqual(campaignProgress({ daysSinceSend: 12, windowDays: 30 }), { final: false, day: 12, days: 30 });
  assert.deepEqual(campaignProgress({ daysSinceSend: 31, windowDays: 30 }), { final: true, day: 30, days: 30 });
  assert.equal(campaignProgress({ final: true, daysSinceSend: 2 }).final, true);
});

test("language names and region colours", () => {
  assert.equal(languageName("fr", "en"), "French");
  assert.equal(languageName("xx", "en"), "XX");
  assert.match(regionTone(null, 0), /zinc/);
  assert.match(regionTone(0.05, 10), /emerald/);
  assert.match(regionTone(0.25, 10), /amber/);
  assert.match(regionTone(0.8, 10), /red/);
});
