import test from "node:test";
import assert from "node:assert/strict";

import {
  buildNotificationTargetPaths,
  campaignMatchesMainPage,
  campaignSectorForTargets,
  expirationDateFromPreset,
  notificationActionFromCta,
  presentationIncludesInbox,
} from "./notificationCampaignConfig.js";

test("entire KunThai intentionally collapses every descendant target", () => {
  assert.deepEqual(buildNotificationTargetPaths({ platforms: ["general", "urmall", "urride"] }), ["all"]);
});

test("UrMall seller targeting keeps exact supported business kinds", () => {
  assert.deepEqual(buildNotificationTargetPaths({
    platforms: ["urmall"],
    urmallAreas: ["seller_dashboard"],
    urmallBusinessTypes: ["restaurant", "vendor"],
  }), ["urmall.seller_dashboard.restaurant", "urmall.seller_dashboard.vendor"]);
});

test("UrRide delivery targeting never widens into transport operators", () => {
  assert.deepEqual(buildNotificationTargetPaths({
    platforms: ["urride"],
    urrideAreas: ["operator", "operator_dashboard"],
    operatorServices: { selected: ["delivery"], delivery: ["motorbike", "van"] },
    operatorDashboardServices: { selected: ["transport"], transport: ["tricycle"] },
  }), [
    "urride.operator.delivery.motorbike",
    "urride.operator.delivery.van",
    "urride.operator_dashboard.transport.tricycle",
  ]);
});

test("surface matching keeps campaigns on their selected main area", () => {
  const displayConfig = { targetPaths: ["urmall.seller_dashboard.restaurant"] };
  assert.equal(campaignMatchesMainPage(displayConfig, "marketplace"), true);
  assert.equal(campaignMatchesMainPage(displayConfig, "transport"), false);
  assert.equal(campaignMatchesMainPage(displayConfig, "explore"), false);
});

test("mixed platform selections use the platform permission scope", () => {
  assert.equal(campaignSectorForTargets(["urmall.buyers", "urride.passenger"]), "platform");
  assert.equal(campaignSectorForTargets(["urride.operator.all"]), "transport");
});

test("temporary-only presentations are excluded from the inbox", () => {
  assert.equal(presentationIncludesInbox("floating"), false);
  assert.equal(presentationIncludesInbox("inline"), false);
  assert.equal(presentationIncludesInbox("floating_inbox"), true);
  assert.equal(presentationIncludesInbox("floating", { includeInbox: true }), true);
});

test("CTA configuration uses registered navigation targets and keeps editable labels", () => {
  assert.deepEqual(notificationActionFromCta({ enabled: true, destination: "swip_video", value: "post-1", label: "Watch now" }), {
    actionTarget: "explore:swip",
    actionData: { actionLabel: "Watch now", postId: "post-1" },
  });
});

test("expiration presets resolve from the supplied clock", () => {
  assert.equal(expirationDateFromPreset("1h", "", 0), new Date(3_600_000).toISOString());
  assert.equal(expirationDateFromPreset("never", "", 0), null);
});
