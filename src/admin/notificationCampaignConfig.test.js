import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCampaignPayload,
  campaignLocationScope,
  campaignToEditorForm,
  describeCampaignLocation,
  createEmptyCampaignForm,
  firstCampaignError,
  isWorldwideCampaign,
  validateCampaignStep,
  withAudience,
  withPresentation,
} from "./notificationCampaignConfig.js";

const NOW = Date.parse("2026-09-20T12:00:00Z");
const USER_ID = "8b0f7a2e-1d4c-4e3a-9a6b-5c2d1e0f9a88";

function restaurantFloatingCampaign() {
  let form = createEmptyCampaignForm();
  form.campaign = { ...form.campaign, name: "Freetown lunch menus", category: "seller_update" };
  form = withAudience(form, { platform: "urmall", urmallRole: "seller", sellerTypes: ["restaurant"] });
  form.locationMode = "countries";
  form.locations = [{ country: "SL", countryName: "Sierra Leone", entireCountry: false, cities: ["Freetown"] }];
  form = withPresentation(form, { type: "floating_inbox" });
  form.content = { ...form.content, title: "Lunch rush is coming", body: "Update today's menu before 11am.", badge: "Today" };
  form.action = { ...form.action, type: "screen", screen: "urmall:business", label: "Open dashboard" };
  form.schedule = { ...form.schedule, mode: "now", endMode: "after", endAfterDays: 3, timeZone: "Africa/Freetown" };
  return form;
}

test("UrMall → Seller → Restaurant → Freetown → Floating card + inbox builds an exact payload", () => {
  const payload = buildCampaignPayload(restaurantFloatingCampaign(), NOW);
  assert.equal(payload.sector, "marketplace");
  assert.equal(payload.audience, "all");
  assert.deepEqual(payload.filter.targets, ["urmall.sellers.restaurant"]);
  assert.deepEqual(payload.filter.locations, [{ country: "SL", countryName: "Sierra Leone", entireCountry: false, cities: ["Freetown"] }]);
  assert.equal(payload.presentation, "floating_inbox");
  assert.equal(payload.configuration.schemaVersion, 2);
  assert.equal(payload.configuration.inbox, "urmall.seller");
  assert.equal(payload.configuration.presentation.screen, "urmall.seller");
  assert.equal(payload.configuration.presentation.includeInbox, true);
  assert.equal(payload.actionTarget, "urmall:business");
  assert.equal(payload.actionData.actionLabel, "Open dashboard");
  assert.equal(payload.configuration.content.badge, "Today");
  assert.equal(payload.schedule, null);
  assert.equal(payload.expiresAt, new Date(NOW + 3 * 86_400_000).toISOString());
  assert.equal(isWorldwideCampaign(payload), false);
  assert.equal(firstCampaignError(restaurantFloatingCampaign(), { now: NOW }), null);
});

test("changing the audience repairs incompatible presentation choices", () => {
  const seller = restaurantFloatingCampaign();
  const operator = withAudience(seller, { platform: "urride", urrideRole: "operator", operatorService: "delivery", operatorVehicles: ["van"] });
  assert.equal(operator.presentation.type, "floating_inbox");
  assert.equal(operator.presentation.screen, "urride.operator");

  let explore = withAudience(createEmptyCampaignForm(), { platform: "explore" });
  explore = withPresentation(explore, { type: "inline" });
  assert.equal(explore.presentation.screen, "explore");
  const toSeller = withAudience(explore, { platform: "urmall", urmallRole: "seller" });
  assert.equal(toSeller.presentation.type, "inbox", "inline is not offered on the seller dashboard");
  assert.equal(toSeller.presentation.screen, "");

  const critical = withPresentation(withAudience(createEmptyCampaignForm(), { platform: "all" }), { type: "critical" }, { canCritical: true });
  assert.equal(critical.presentation.type, "critical");
  assert.equal(critical.campaign.priority, "critical");
  assert.equal(critical.presentation.dismissible, false);
  assert.equal(withPresentation(withAudience(createEmptyCampaignForm(), { platform: "all" }), { type: "critical" }).presentation.type, "inbox");
});

test("KunThai ID campaigns ignore location and do not need the worldwide acknowledgement", () => {
  const form = restaurantFloatingCampaign();
  form.audienceMode = "users";
  form.users = [{ user_id: USER_ID, public_id: "KTU-AAAA-BBBB-CCCC" }];
  const payload = buildCampaignPayload(form, NOW);
  assert.equal(payload.audience, "specific_users");
  assert.deepEqual(payload.filter.userIds, [USER_ID]);
  assert.deepEqual(payload.filter.kunthaiIds, ["KTU-AAAA-BBBB-CCCC"]);
  assert.deepEqual(payload.filter.locations, []);
  assert.equal(isWorldwideCampaign(payload), false);
  assert.equal(validateCampaignStep("audience", { ...form, users: [] }), "Add at least one KunThai ID.");
});

test("broad audiences require the worldwide acknowledgement", () => {
  const form = withAudience(createEmptyCampaignForm(), { platform: "all" });
  form.campaign.name = "Maintenance";
  assert.equal(isWorldwideCampaign(buildCampaignPayload(form, NOW)), true);
  assert.equal(isWorldwideCampaign({ audience_type: "all", audience_filter: { targets: ["urmall.buyers"], locations: [{ country: "SL" }] } }), false);
});

test("step validation catches unsafe or incomplete campaigns", () => {
  const form = restaurantFloatingCampaign();
  assert.match(validateCampaignStep("campaign", { ...form, campaign: { ...form.campaign, name: "" } }), /internal name/);
  assert.match(validateCampaignStep("campaign", { ...form, campaign: { ...form.campaign, priority: "critical" } }), /permission/);
  assert.match(validateCampaignStep("campaign", { ...form, campaign: { ...form.campaign, priority: "critical" } }, { canCritical: true }), /safety, security/);
  assert.match(validateCampaignStep("audience", { ...form, locations: [{ country: "SL", countryName: "Sierra Leone", entireCountry: false, cities: [] }] }), /at least one city/);
  assert.match(validateCampaignStep("presentation", { ...form, presentation: { ...form.presentation, screen: "urride.operator" } }), /screen/);
  assert.match(validateCampaignStep("presentation", { ...form, campaign: { ...form.campaign, category: "promotion" }, presentation: { ...form.presentation, dismissible: false } }), /dismissible/);
  assert.match(validateCampaignStep("content", { ...form, content: { ...form.content, mediaUrl: "http://example.com/a.png" } }), /https/);
  assert.match(validateCampaignStep("action", { ...form, action: { type: "external", url: "javascript:alert(1)", label: "Go" } }), /https/);
  assert.match(validateCampaignStep("action", { ...form, action: { type: "screen", screen: "urride:trips", label: "Go" } }), /not available/);

  const past = { ...form, schedule: { ...form.schedule, mode: "later", startAt: "2026-09-20T11:00", timeZone: "UTC" } };
  assert.match(validateCampaignStep("schedule", past, { now: NOW }), /at least a minute/);
  const endBeforeStart = { ...form, schedule: { ...form.schedule, mode: "later", startAt: "2026-09-21T09:00", endMode: "at", endAt: "2026-09-21T08:00", timeZone: "UTC" } };
  assert.match(validateCampaignStep("schedule", endBeforeStart, { now: NOW }), /after the start/);
});

test("scheduled campaigns store UTC timestamps from the chosen time zone", () => {
  const form = restaurantFloatingCampaign();
  form.schedule = { mode: "later", startAt: "2026-09-21T09:00", endMode: "at", endAt: "2026-09-22T09:00", endAfterDays: 7, timeZone: "Africa/Lagos" };
  const payload = buildCampaignPayload(form, NOW);
  assert.equal(payload.schedule, "2026-09-21T08:00:00.000Z");
  assert.equal(payload.expiresAt, "2026-09-22T08:00:00.000Z");
  assert.equal(validateCampaignStep("schedule", form, { now: NOW }), "");
});

test("saved campaigns reopen in the builder", () => {
  const payload = buildCampaignPayload(restaurantFloatingCampaign(), NOW);
  const reopened = campaignToEditorForm({ configuration: payload.configuration, scheduled_at: null });
  assert.deepEqual(reopened.audience, restaurantFloatingCampaign().audience);
  assert.equal(reopened.presentation.type, "floating_inbox");
  assert.equal(reopened.content.title, "Lunch rush is coming");

  const legacy = campaignToEditorForm({
    campaign_name: "Old operator notice",
    title: "Hello operators",
    body: "Legacy body",
    presentation: "floating",
    priority: "high",
    category: "operator_update",
    audience_filter: { targets: ["urride.operator_dashboard.transport.all"] },
    configuration: { targetPaths: ["urride.operator_dashboard.transport.all"] },
  });
  assert.equal(legacy.audience.platform, "urride");
  assert.equal(legacy.audience.urrideRole, "operator");
  assert.equal(legacy.presentation.type, "floating");
  assert.equal(legacy.presentation.screen, "urride.operator");
  assert.equal(legacy.content.title, "Hello operators");
});

test("states and districts: several regions per country travel as regionIds", () => {
  const form = restaurantFloatingCampaign();
  form.locations = [
    { country: "SL", countryName: "Sierra Leone", scope: "regions", entireCountry: false, cities: ["Freetown"], regions: [
      { id: "11111111-1111-4111-8111-111111111111", name: "Kambia", type: "District" },
      { id: "22222222-2222-4222-8222-222222222222", name: "Port Loko", type: "District" },
      { id: "11111111-1111-4111-8111-111111111111", name: "Kambia", type: "District" },
    ] },
    { country: "NG", countryName: "Nigeria", scope: "country", entireCountry: true, cities: [], regions: [] },
  ];
  assert.equal(validateCampaignStep("audience", form), "");
  const payload = buildCampaignPayload(form, NOW);
  assert.deepEqual(payload.filter.locations, [
    {
      country: "SL",
      countryName: "Sierra Leone",
      entireCountry: false,
      cities: [],
      regionIds: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
      regions: [
        { id: "11111111-1111-4111-8111-111111111111", name: "Kambia", type: "District" },
        { id: "22222222-2222-4222-8222-222222222222", name: "Port Loko", type: "District" },
      ],
    },
    { country: "NG", countryName: "Nigeria", entireCountry: true, cities: [] },
  ]);
  assert.equal(isWorldwideCampaign(payload), false);
  assert.equal(describeCampaignLocation(form.locations[0]), "Sierra Leone (Kambia, Port Loko)");
  assert.equal(describeCampaignLocation(form.locations[1]), "Nigeria (entire country)");
});

test("a country limited to states/districts needs at least one", () => {
  const form = restaurantFloatingCampaign();
  form.locations = [{ country: "NG", countryName: "Nigeria", scope: "regions", entireCountry: false, cities: [], regions: [] }];
  assert.match(validateCampaignStep("audience", form), /state or district in Nigeria/);
  assert.equal(campaignLocationScope(form.locations[0]), "regions");
  // Older saved campaigns without a scope keep their meaning.
  assert.equal(campaignLocationScope({ entireCountry: true }), "country");
  assert.equal(campaignLocationScope({ entireCountry: false, cities: ["Bo"] }), "cities");
  assert.equal(campaignLocationScope({ entireCountry: false, regionIds: ["x"] }), "regions");
});
