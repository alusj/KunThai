import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ACTION_SCREENS, OPENING_ANIMATIONS, CLOSING_ANIMATIONS, compatibleScreens, inboxForAudience } from "../Backend/services/campaigns/campaignModel.js";

// The database is the authority for campaign security and delivery. These
// checks pin the rules in the migration and keep its lists identical to the
// JavaScript model the admin builder and the KunThai screens use.

const migration = readFileSync(
  new URL("../../supabase/migrations/20260917120000_admin_campaign_delivery_v2.sql", import.meta.url),
  "utf8",
);
const scheduledPublisher = readFileSync(new URL("../../server/cron/admin-publish-scheduled.js", import.meta.url), "utf8");
const pushFunction = readFileSync(new URL("../../supabase/functions/send-notification-push/index.ts", import.meta.url), "utf8");

function functionBody(name) {
  const start = migration.search(new RegExp(`create (or replace )?function public\\.${name}\\(`));
  assert.ok(start >= 0, `${name} is defined`);
  const bodyStart = migration.indexOf("$$", start);
  const bodyEnd = migration.indexOf("$$;", bodyStart + 2);
  return migration.slice(start, bodyEnd);
}

function sqlArray(name) {
  const match = migration.match(new RegExp(`${name} constant text\\[\\] := array\\[([^\\]]*)\\]`));
  assert.ok(match, `${name} array exists`);
  return match[1].split(",").map((value) => value.trim().replace(/^'|'$/g, ""));
}

test("every admin RPC checks permissions on the server", () => {
  const checks = {
    admin_validate_campaign_spec: /admin_has_permission\('notifications\.manage', campaign_sector\)/,
    admin_update_campaign: /admin_has_permission\('notifications\.manage', previous_campaign\.sector\)/,
    admin_approve_campaign: /admin_has_permission\('notifications\.approve'/,
    admin_publish_campaign: /auth\.uid\(\) is not null and not \(public\.admin_has_permission\('notifications\.publish'/,
    admin_run_due_campaigns: /public\.is_kunthai_admin\(\)/,
    admin_end_campaign: /admin_has_permission\('notifications\.manage'/,
    admin_cancel_campaign: /admin_has_permission\('notifications\.manage'/,
    admin_send_campaign_test: /admin_has_permission\('notifications\.test'/,
    admin_check_campaign_test_recipient: /admin_has_permission\('notifications\.test'/,
    admin_get_campaign_metrics: /admin_has_permission\('notifications\.analytics'/,
    admin_lookup_campaign_user: /admin_has_permission\('notifications\.manage'\)/,
    admin_campaign_location_options: /admin_has_permission\('notifications\.manage'\)/,
  };
  Object.entries(checks).forEach(([name, pattern]) => assert.match(functionBody(name), pattern, name));
  // admin_create_campaign delegates to the spec validator before inserting.
  assert.match(functionBody("admin_create_campaign"), /perform public\.admin_validate_campaign_spec/);
});

test("internal delivery functions are never callable from the browser", () => {
  ["admin_publish_campaign_rows(uuid)", "admin_publish_due_campaigns()", "admin_campaign_recipient_ids(text,text,jsonb)", "admin_notification_user_matches_target(uuid,text)", "admin_notification_user_matches_location(uuid,jsonb)"].forEach((signature) => {
    const escaped = signature.replace(/[()]/g, "\\$&");
    assert.match(migration, new RegExp(`revoke all on function public\\.${escaped} from public, anon, authenticated;`), signature);
    assert.doesNotMatch(migration, new RegExp(`grant execute on function public\\.${escaped} to`), signature);
  });
  assert.doesNotMatch(migration, /to anon/);
});

test("KunThai ID lookup never returns email or phone", () => {
  const body = functionBody("admin_lookup_campaign_user");
  const returns = body.match(/returns table\(([^)]*)\)/)[1];
  assert.doesNotMatch(returns, /email|phone/i);
  assert.match(body, /kunthai_account_identities/);
});

test("audiences resolve real accounts with exact subtypes and locations", () => {
  const target = functionBody("admin_notification_user_matches_target");
  assert.match(target, /business_kind/);
  assert.match(target, /when 'hotel' then 'property_agent'/);
  assert.match(target, /vehicle = 'van' and lower\(coalesce\(fleet\.fleet_type::text, ''\)\) in \('car', 'van'\)/);
  assert.match(target, /kind = 'delivery' and lower\(coalesce\(fleet\.service_category::text, ''\)\) in \('delivery', 'both'\)/);
  assert.match(target, /kind = 'rental' and fleet\.service_category = 'Rental'/);
  assert.match(target, /marketplace_orders purchase where purchase\.buyer_id/);
  assert.match(target, /transport_trips trip where trip\.passenger_id/);

  const location = functionBody("admin_notification_user_matches_location");
  assert.match(location, /marketplace_businesses business/, "business city counts for sellers");
  assert.match(location, /entireCountry/);

  const recipients = functionBody("admin_campaign_recipient_ids");
  assert.match(recipients, /coalesce\(users\.is_anonymous, false\) = false/, "guest sessions never receive campaigns");
  assert.match(recipients, /campaign_audience = 'specific_users'\s+or public\.admin_notification_user_matches_location/);
});

test("validation mirrors the JavaScript destination rules", () => {
  const spec = functionBody("admin_validate_campaign_spec");
  assert.deepEqual(sqlArray("action_screens"), ACTION_SCREENS.map((screen) => screen.value));
  assert.deepEqual(sqlArray("opening_animations"), OPENING_ANIMATIONS.map(([value]) => value));
  assert.deepEqual(sqlArray("closing_animations"), CLOSING_ANIMATIONS.map(([value]) => value));

  const branches = {
    all: { platform: "all" },
    explore: { platform: "explore" },
    "urmall.all": { platform: "urmall", urmallRole: "all" },
    "urmall.buyer": { platform: "urmall", urmallRole: "buyer" },
    "urmall.seller": { platform: "urmall", urmallRole: "seller" },
    "urride.all": { platform: "urride", urrideRole: "all" },
    "urride.passenger": { platform: "urride", urrideRole: "passenger" },
    "urride.operator": { platform: "urride", urrideRole: "operator" },
    "urride.company": { platform: "urride", urrideRole: "company" },
  };
  Object.entries(branches).forEach(([branch, audience]) => {
    const screens = compatibleScreens(audience).map((screen) => `'${screen}'`).join(",");
    assert.ok(spec.includes(`when '${branch}' then array[${screens}]`), `${branch} screens`);
    assert.ok(new RegExp(`when '${branch.replace(".", "\\.")}' then '${inboxForAudience(audience).replace(".", "\\.")}'`).test(spec), `${branch} inbox`);
  });
  assert.match(spec, /The linked product no longer exists/);
  assert.match(spec, /Media must be an HTTPS link/);
  assert.match(spec, /Campaign sector does not match its audience/);
});

test("publication is confirmed, deduplicated and records failures", () => {
  const publish = functionBody("admin_publish_campaign");
  assert.match(publish, /Worldwide publication must be explicitly confirmed/);
  assert.match(publish, /confirmed_audience is distinct from actual_audience/);
  assert.match(functionBody("admin_publish_campaign_rows"), /on conflict \(campaign_id, user_id\) where campaign_id is not null do nothing/);
  assert.match(functionBody("admin_publish_campaign_rows"), /This campaign expired before it could be sent/);
  const due = functionBody("admin_publish_due_campaigns");
  assert.match(due, /for update skip locked/);
  assert.match(due, /status = 'failed', failure_count = failure_count \+ 1, last_error = left\(sqlerrm, 500\)/);
  assert.match(migration, /cron\.schedule\('kunthai-publish-due-campaigns', '\* \* \* \* \*', 'select public\.admin_publish_due_campaigns\(\)'\)/);
  assert.match(functionBody("admin_create_campaign"), /The scheduled time is in the past/);
});

test("test sends use the real presentation but stay out of analytics", () => {
  const body = functionBody("admin_send_campaign_test");
  assert.match(body, /'admin_test'/);
  assert.match(body, /campaign\.configuration \|\| jsonb_build_object\('testCampaignId', campaign\.id\)/);
  assert.doesNotMatch(body.split("values")[0], /campaign_id/, "test rows carry no campaign_id");
});

test("analytics are counted from delivery rows and never invent rates", () => {
  const metrics = functionBody("admin_get_campaign_metrics");
  ["viewed", "clicked", "dismissed", "inboxRead", "pending", "delivered"].forEach((key) => assert.match(metrics, new RegExp(`'${key}'`)));
  assert.match(metrics, /'viewRate', case when counts\.delivered > 0 then .* else null end/);
  assert.match(metrics, /'pushSent', case when 'push' = any\(campaign\.channels\) then counts\.push_sent else null end/);
  const cleanup = functionBody("cleanup_expired_user_notifications");
  assert.match(cleanup, /campaign_id is not null\s+and created_at < now\(\) - interval '365 days'/, "campaign rows outlive expiry for analytics");
});

test("people can only write receipts on their own delivery rows", () => {
  const guard = functionBody("guard_platform_notification_user_update");
  ["title", "body", "action_target", "action_data", "display_config", "presentation", "campaign_id", "expires_at"].forEach((column) => {
    assert.match(guard, new RegExp(`new\\.${column} := old\\.${column}`), column);
  });
  assert.match(guard, /if old\.dismissed_at is not null then new\.dismissed_at := old\.dismissed_at/);
  assert.match(guard, /if old\.clicked_at is not null then new\.clicked_at := old\.clicked_at/);
});

test("scheduled push reaches campaigns released by the database job", () => {
  assert.match(scheduledPublisher, /admin_publish_due_campaigns/);
  assert.match(scheduledPublisher, /gte\("published_at", since\)/);
  assert.match(scheduledPublisher, /CRON_SECRET/);
  assert.match(pushFunction, /serviceRoleRequest/);
  assert.match(pushFunction, /is\("push_sent_at", null\)/);
});
