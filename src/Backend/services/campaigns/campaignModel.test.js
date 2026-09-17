import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTION_SCREENS,
  audienceKey,
  audienceTargetPaths,
  buildCampaignAction,
  campaignContentFromRow,
  campaignDisplayStatus,
  campaignFrequencyAllows,
  campaignRate,
  campaignRowInInbox,
  campaignRowInbox,
  campaignRowMatchesSurface,
  campaignRowStillPresentable,
  campaignSectorForAudience,
  compatiblePresentations,
  compatibleScreens,
  inboxForAudience,
  isSafeExternalUrl,
  normalizeAudience,
  resolvePresentationSettings,
  screenSupportsPresentation,
  selectCampaignPresentations,
  utcIsoToZonedLocal,
  validateCampaignAction,
  zonedLocalToUtcIso,
} from "./campaignModel.js";

const PRODUCT_ID = "3f1c2b8e-4c1d-4a57-9b7e-2f7a1c9d0e11";

test("UrMall seller subtype targeting resolves to exact business kinds", () => {
  assert.deepEqual(audienceTargetPaths({ platform: "urmall", urmallRole: "seller", sellerTypes: ["restaurant"] }), ["urmall.sellers.restaurant"]);
  assert.deepEqual(audienceTargetPaths({ platform: "urmall", urmallRole: "seller", sellerTypes: [] }), ["urmall.sellers.all"]);
  assert.deepEqual(
    audienceTargetPaths({ platform: "urmall", urmallRole: "seller", sellerTypes: ["retail", "property_agent", "hotel"] }),
    ["urmall.sellers.retail", "urmall.sellers.property_agent"],
  );
  assert.deepEqual(audienceTargetPaths({ platform: "urmall", urmallRole: "buyer", sellerTypes: ["retail"] }), ["urmall.buyers"]);
  assert.deepEqual(audienceTargetPaths({ platform: "urmall", urmallRole: "all" }), ["urmall.general"]);
});

test("UrRide operator targeting only offers vehicles that exist for the chosen service", () => {
  assert.deepEqual(audienceTargetPaths({ platform: "urride", urrideRole: "operator", operatorService: "all" }), ["urride.operator.all"]);
  assert.deepEqual(
    audienceTargetPaths({ platform: "urride", urrideRole: "operator", operatorService: "transport", operatorVehicles: ["motorbike", "taxi"] }),
    ["urride.operator.transport.motorbike", "urride.operator.transport.taxi"],
  );
  // A van is a delivery vehicle; "taxi" is dropped for delivery operators.
  assert.deepEqual(
    audienceTargetPaths({ platform: "urride", urrideRole: "operator", operatorService: "delivery", operatorVehicles: ["van", "taxi"] }),
    ["urride.operator.delivery.van"],
  );
  assert.deepEqual(audienceTargetPaths({ platform: "urride", urrideRole: "operator", operatorService: "delivery" }), ["urride.operator.delivery.all"]);
  assert.deepEqual(audienceTargetPaths({ platform: "urride", urrideRole: "company", companyTypes: ["rental"] }), ["urride.company_dashboard.rental"]);
  assert.deepEqual(audienceTargetPaths({ platform: "urride", urrideRole: "passenger" }), ["urride.passenger"]);
});

test("unknown or empty audiences never resolve to anyone", () => {
  assert.deepEqual(audienceTargetPaths({}), []);
  assert.deepEqual(audienceTargetPaths({ platform: "everyone" }), []);
  assert.equal(audienceKey({ platform: "urride", urrideRole: "driver" }), "urride.all");
  assert.deepEqual(audienceTargetPaths({ platform: "all" }), ["all"]);
  assert.equal(normalizeAudience({ platform: "explore", sellerTypes: ["retail"] }).sellerTypes.length, 0);
});

test("sector, inbox and screens follow the audience", () => {
  assert.equal(campaignSectorForAudience({ platform: "urmall" }), "marketplace");
  assert.equal(campaignSectorForAudience({ platform: "urride" }), "transport");
  assert.equal(campaignSectorForAudience({ platform: "all" }), "platform");
  assert.equal(inboxForAudience({ platform: "urmall", urmallRole: "seller" }), "urmall.seller");
  assert.equal(inboxForAudience({ platform: "urmall", urmallRole: "buyer" }), "urmall");
  assert.equal(inboxForAudience({ platform: "urride", urrideRole: "company" }), "urride.company");
  assert.equal(inboxForAudience({ platform: "all" }), "explore");
  assert.deepEqual(compatibleScreens({ platform: "urride", urrideRole: "operator" }), ["urride.operator"]);
  assert.deepEqual(compatibleScreens({ platform: "all" }), ["any", "explore"]);
  assert.deepEqual(compatibleScreens({}), []);
});

test("presentation choices depend on the audience and permissions", () => {
  const seller = { platform: "urmall", urmallRole: "seller" };
  const sellerOptions = compatiblePresentations(seller).map((item) => item.value);
  assert.ok(sellerOptions.includes("floating_inbox"));
  assert.ok(!sellerOptions.includes("inline"), "the seller dashboard has no navigation bar for inline cards");
  assert.ok(!sellerOptions.includes("critical"), "critical needs permission");
  assert.ok(compatiblePresentations(seller, { canCritical: true }).some((item) => item.value === "critical"));
  assert.ok(compatiblePresentations({ platform: "explore" }).some((item) => item.value === "inline"));
  assert.deepEqual(compatiblePresentations({}), []);
  assert.equal(screenSupportsPresentation("urride.operator", "inline"), false);
  assert.equal(screenSupportsPresentation("urride.passenger", "inline_inbox"), true);
  assert.equal(screenSupportsPresentation("", "inbox"), true);
});

test("a delivered card only appears on the interface it targets", () => {
  const sellerCard = {
    presentation: "floating_inbox",
    display_config: { presentation: { screen: "urmall.seller" }, audience: { sellerTypes: ["restaurant"] } },
  };
  assert.equal(campaignRowMatchesSurface(sellerCard, { page: "marketplace", role: "buyer" }), false);
  assert.equal(campaignRowMatchesSurface(sellerCard, { page: "marketplace", role: "seller", businessKind: "restaurant" }), true);
  assert.equal(campaignRowMatchesSurface(sellerCard, { page: "marketplace", role: "seller", businessKind: "retail" }), false);
  assert.equal(campaignRowMatchesSurface(sellerCard, { page: "transport", role: "operator" }), false);

  const anywhere = { presentation: "modal", display_config: { presentation: { screen: "any" } } };
  assert.equal(campaignRowMatchesSurface(anywhere, { page: "transport", role: "company" }), true);

  const operator = { presentation: "banner", display_config: { presentation: { screen: "urride.operator" } } };
  assert.equal(campaignRowMatchesSurface(operator, { page: "transport", role: "passenger" }), false);
  assert.equal(campaignRowMatchesSurface(operator, { page: "transport", role: "operator" }), true);

  // Campaigns sent before destinations existed keep their page-level behaviour.
  const legacy = { presentation: "floating", display_config: { targetPaths: ["urmall.seller_dashboard.all"] } };
  assert.equal(campaignRowMatchesSurface(legacy, { page: "marketplace", role: "seller" }), true);
  assert.equal(campaignRowMatchesSurface(legacy, { page: "explore" }), false);
});

test("inbox routing keeps role campaigns out of the buyer bell and passenger header", () => {
  assert.equal(campaignRowInbox({ sector: "marketplace", display_config: { inbox: "urmall.seller" } }), "urmall.seller");
  assert.equal(campaignRowInbox({ sector: "transport", display_config: { inbox: "urride.company" } }), "urride.company");
  assert.equal(campaignRowInbox({ sector: "transport", display_config: { targetPaths: ["urride.operator.all"] } }), "urride.operator");
  assert.equal(campaignRowInbox({ sector: "marketplace", display_config: {} }), "urmall");
  assert.equal(campaignRowInbox({ sector: "platform" }), "explore");
  assert.equal(campaignRowInInbox({ presentation: "floating" }), false);
  assert.equal(campaignRowInInbox({ presentation: "floating_inbox" }), true);
  assert.equal(campaignRowInInbox({ presentation: "inbox" }), true);
});

test("actions only produce validated KunThai destinations", () => {
  assert.deepEqual(buildCampaignAction({ type: "none" }), { actionTarget: "", actionData: {} });
  assert.deepEqual(buildCampaignAction({ type: "screen", screen: "urmall:orders", label: "Track" }), {
    actionTarget: "urmall:orders",
    actionData: { actionLabel: "Track" },
  });
  assert.deepEqual(buildCampaignAction({ type: "screen", screen: "javascript:alert(1)", label: "Go" }).actionTarget, "");
  assert.deepEqual(buildCampaignAction({ type: "entity", entityKind: "urmall:product", entityId: PRODUCT_ID, label: "Shop" }), {
    actionTarget: "urmall:product",
    actionData: { actionLabel: "Shop", productId: PRODUCT_ID },
  });
  assert.equal(buildCampaignAction({ type: "entity", entityKind: "urmall:product", entityId: "123" }).actionTarget, "");
  assert.equal(buildCampaignAction({ type: "external", url: "http://example.com" }).actionTarget, "");
  assert.equal(buildCampaignAction({ type: "external", url: "https://kunthai.app/help" }).actionTarget, "external");

  assert.equal(isSafeExternalUrl("javascript:alert(1)"), false);
  assert.equal(isSafeExternalUrl("https://user:pass@evil.example"), false);
  assert.equal(validateCampaignAction({ type: "screen", screen: "urride:operator-dashboard", label: "Open" }, "urmall"), "That screen is not available to this audience.");
  assert.equal(validateCampaignAction({ type: "screen", screen: "urride:operator-dashboard", label: "Open" }, "urride"), "");
  assert.match(validateCampaignAction({ type: "entity", entityKind: "profile", entityId: "KTU-1", label: "View" }), /valid KunThai ID/);
  assert.match(validateCampaignAction({ type: "external", url: "ftp://files", label: "Open" }), /https/);
  assert.ok(ACTION_SCREENS.every((screen) => screen.platforms.includes("all")));
});

test("schedules convert wall-clock time in the chosen time zone to UTC", () => {
  assert.equal(zonedLocalToUtcIso("2026-09-20T14:00", "Africa/Freetown"), "2026-09-20T14:00:00.000Z");
  assert.equal(zonedLocalToUtcIso("2026-09-20T14:00", "Africa/Lagos"), "2026-09-20T13:00:00.000Z");
  // British Summer Time and US winter time.
  assert.equal(zonedLocalToUtcIso("2026-07-01T12:00", "Europe/London"), "2026-07-01T11:00:00.000Z");
  assert.equal(zonedLocalToUtcIso("2026-01-15T09:30", "America/New_York"), "2026-01-15T14:30:00.000Z");
  assert.equal(zonedLocalToUtcIso("", "UTC"), null);
  assert.equal(utcIsoToZonedLocal("2026-07-01T11:00:00.000Z", "Europe/London"), "2026-07-01T12:00");
  assert.equal(zonedLocalToUtcIso("2026-09-20T14:00", "Not/AZone"), "2026-09-20T14:00:00.000Z");
});

test("frequency rules limit repeat presentations", () => {
  const now = Date.parse("2026-09-20T12:00:00Z");
  assert.equal(campaignFrequencyAllows({ presentation_count: 0 }, "once"), true);
  assert.equal(campaignFrequencyAllows({ presentation_count: 1 }, "once"), false);
  assert.equal(campaignFrequencyAllows({ presentation_count: 3 }, "once_per_session"), true);
  assert.equal(campaignFrequencyAllows({ presentation_count: 3 }, "once_per_session", { sessionSeen: true }), false);
  assert.equal(campaignFrequencyAllows({ last_presented_at: "2026-09-20T06:00:00Z" }, "daily", { now }), false);
  assert.equal(campaignFrequencyAllows({ last_presented_at: "2026-09-19T06:00:00Z" }, "daily", { now }), true);
  assert.equal(campaignFrequencyAllows({ dismissed_at: "2026-09-19T06:00:00Z" }, "once_per_session"), false);
});

test("the presentation host picks one overlay and one inline card for the current screen", () => {
  const now = Date.parse("2026-09-20T12:00:00Z");
  const base = { status: "unread", campaign_id: "c", created_at: "2026-09-20T10:00:00Z", presentation_count: 0 };
  const rows = [
    { ...base, id: "banner", presentation: "banner", display_config: { presentation: { screen: "explore" } } },
    { ...base, id: "modal", presentation: "modal", display_config: { presentation: { screen: "explore" } } },
    { ...base, id: "inline", presentation: "inline_inbox", display_config: { presentation: { screen: "explore" } } },
    { ...base, id: "seller", presentation: "critical", display_config: { presentation: { screen: "urmall.seller" } } },
    { ...base, id: "expired", presentation: "modal", expires_at: "2026-09-20T11:00:00Z", display_config: { presentation: { screen: "explore" } } },
    { ...base, id: "dismissed", presentation: "modal", dismissed_at: "2026-09-20T11:00:00Z", display_config: { presentation: { screen: "explore" } } },
    { ...base, id: "inbox-only", presentation: "inbox", display_config: {} },
  ];
  const explore = selectCampaignPresentations(rows, { page: "explore" }, { now });
  assert.equal(explore.overlay.id, "modal");
  assert.equal(explore.inline.id, "inline");

  const seller = selectCampaignPresentations(rows, { page: "marketplace", role: "seller" }, { now });
  assert.equal(seller.overlay.id, "seller");
  assert.equal(seller.inline, null);

  const noFloating = selectCampaignPresentations(rows, { page: "explore" }, { now, preferences: { floating_enabled: false } });
  assert.equal(noFloating.overlay, null);

  const test = selectCampaignPresentations(
    [{ ...base, campaign_id: null, notification_type: "admin_test", id: "test", presentation: "floating", display_config: { presentation: { screen: "explore" } } }],
    { page: "explore" },
    { now },
  );
  assert.equal(test.overlay.id, "test", "test sends render like the real campaign");

  const shown = { ...rows[1], presentation_count: 1 };
  assert.equal(selectCampaignPresentations([shown], { page: "explore" }, { now }).overlay, null);
  assert.equal(campaignRowStillPresentable(shown, { page: "explore" }, now), true, "a card already on screen is not removed by its own view receipt");
  assert.equal(campaignRowStillPresentable({ ...shown, status: "read" }, { page: "explore" }, now), false);
});

test("renderer settings ignore irrelevant or unsafe values", () => {
  const modal = resolvePresentationSettings({ presentation: { position: "bottom_right", width: "wide", openingAnimation: "glass_rise", animationDurationMs: 99999 } }, "modal");
  assert.equal(modal.position, "top", "modals have no position control");
  assert.equal(modal.width, "wide");
  assert.equal(modal.openingAnimation, "slide_up", "legacy animation names are mapped");
  assert.equal(modal.animationDurationMs, 1200);

  const critical = resolvePresentationSettings({ behaviour: { canDismiss: true }, presentation: { closeButton: true } }, "critical");
  assert.equal(critical.canDismiss, false);
  assert.equal(critical.closeButton, false);

  const locked = resolvePresentationSettings({ behaviour: { canDismiss: false }, presentation: { closeButton: true, backdropDismiss: true } }, "bottom_sheet");
  assert.equal(locked.closeButton, false);
  assert.equal(locked.backdropDismiss, false);
});

test("card content comes only from the delivered row", () => {
  const content = campaignContentFromRow({
    title: "Lunch rush",
    body: "Update today's menu",
    sector: "marketplace",
    action_target: "urmall:business",
    action_data: { actionLabel: "Open dashboard", secondaryLabel: "Later" },
    display_config: { content: { icon: "store", badge: "New" }, media: { kind: "image", url: "http://insecure.example/a.png" } },
  });
  assert.equal(content.mediaUrl, "", "non-https media is never rendered");
  assert.equal(content.hasAction, true);
  assert.equal(content.actionLabel, "Open dashboard");
  assert.equal(content.secondaryLabel, "Later");
  assert.equal(content.sectionLabel, "UrMall update");
});

test("analytics rates are unavailable instead of invented", () => {
  assert.equal(campaignRate(0, 0), null);
  assert.equal(campaignRate(5, 0), null);
  assert.equal(campaignRate(1, 3), 33.3);
  assert.equal(campaignDisplayStatus({ status: "completed", expires_at: "2020-01-01T00:00:00Z" }), "completed");
  assert.equal(campaignDisplayStatus({ status: "completed", expires_at: null }), "active");
  assert.equal(campaignDisplayStatus({ status: "pending_approval" }), "awaiting_approval");
});
