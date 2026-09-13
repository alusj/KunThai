import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260913110000_admin_notification_campaign_center.sql", import.meta.url),
  "utf8",
);
const scheduledPublisher = readFileSync(new URL("../../api/admin-publish-scheduled.js", import.meta.url), "utf8");
const pushFunction = readFileSync(new URL("../../supabase/functions/send-notification-push/index.ts", import.meta.url), "utf8");

test("campaign schema stores structured targeting and immutable delivery presentation", () => {
  assert.match(migration, /campaign_name text not null default ''/);
  assert.match(migration, /configuration jsonb not null default '\{\}'::jsonb/);
  assert.match(migration, /display_config jsonb not null default '\{\}'::jsonb/);
  assert.match(migration, /new\.display_config := old\.display_config/);
});

test("specific campaign recipients resolve through a KTU ID without exposing email", () => {
  assert.match(migration, /admin_lookup_campaign_user\(public_kunthai_id text\)/);
  assert.match(migration, /kunthai_account_identities/);
  assert.match(migration, /campaign_filter->'userIds'/);
  const returnShape = migration.match(/admin_lookup_campaign_user[\s\S]*?returns table\(([\s\S]*?)\)/)?.[1] || "";
  assert.doesNotMatch(returnShape, /email/i);
});

test("country-city targeting cannot silently widen an empty city selection", () => {
  assert.match(migration, /City-targeted countries require at least one city/);
  assert.match(migration, /selected->>'entireCountry'/);
  assert.match(migration, /jsonb_array_elements_text\(coalesce\(selected->'cities'/);
});

test("hierarchical UrMall and UrRide targeting stays server enforced", () => {
  assert.match(migration, /admin_notification_user_matches_target/);
  assert.match(migration, /business\.business_kind/);
  assert.match(migration, /fleet\.service_category/);
  assert.match(migration, /fleet\.fleet_type/);
  assert.match(migration, /transport_company_fleets/);
});

test("high-impact publication requires backend confirmation and preserves deduplication", () => {
  assert.match(migration, /confirmed_audience integer default null/);
  assert.match(migration, /confirmed_worldwide boolean default false/);
  assert.match(migration, /actual_audience >= 10000/);
  assert.match(migration, /Worldwide publication must be explicitly confirmed/);
  assert.match(migration, /on conflict \(campaign_id, user_id\).*do nothing/s);
});

test("scheduled publication also queues configured device push", () => {
  assert.match(scheduledPublisher, /admin_publish_due_campaigns/);
  assert.match(scheduledPublisher, /send-notification-push/);
  assert.match(scheduledPublisher, /contains\("channels", \["push"\]\)/);
  assert.match(pushFunction, /serviceRoleRequest/);
  assert.match(pushFunction, /notifications\.publish/);
});

