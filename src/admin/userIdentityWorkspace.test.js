import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260915120000_admin_user_identity_workspace.sql", import.meta.url),
  "utf8",
);
const usersView = readFileSync(new URL("./views/UsersView.jsx", import.meta.url), "utf8");
const adminService = readFileSync(new URL("./adminService.js", import.meta.url), "utf8");
const previewData = readFileSync(new URL("./adminPreviewData.js", import.meta.url), "utf8");

test("user directory searches by canonical KunThai ID without replacing existing fields", () => {
  assert.match(migration, /admin_search_users_v3/);
  assert.match(migration, /public_id text/);
  assert.match(migration, /kunthai_public_user_id_from_uuid/);
  assert.match(migration, /regexp_replace\(public\.kunthai_public_user_id_from_uuid/);
});

test("identity workspace returns separate ownership and service relationships", () => {
  assert.match(migration, /admin_get_user_workspace_v2/);
  assert.match(migration, /'businesses', v_businesses/);
  assert.match(migration, /'companies', v_companies/);
  assert.match(migration, /'operators', v_operators/);
  assert.match(migration, /'admin_roles', v_admin_roles/);
  assert.match(migration, /\{is_admin\}/);
  assert.match(migration, /'subscriptions', v_subscriptions/);
  assert.match(migration, /role', 'owner'/);
  assert.match(migration, /role', 'admin'/);
  assert.match(migration, /assignment\.status = 'active'/);
  assert.match(migration, /assignment\.expires_at is null/);
});

test("UrMall and UrRide workspace exposes plan usage and rental capacity", () => {
  assert.match(migration, /'product_count'/);
  assert.match(migration, /'published_product_count'/);
  assert.match(migration, /'rental_fleet_count'/);
  assert.match(migration, /'reservation_count'/);
  assert.match(migration, /'vehicle_limit'/);
  assert.match(migration, /'operator_limit'/);
  assert.match(migration, /admin_has_permission\('marketplace\.view', 'marketplace'\)/);
  assert.match(migration, /admin_has_permission\('transport\.view', 'transport'\)/);
});

test("Users UI keeps notification targeting on KunThai ID and adds service tabs", () => {
  assert.match(usersView, /filter: \{ userIds: \[user\.user_id\], kunthaiIds/);
  assert.match(usersView, /label: "Accounts & roles"/);
  assert.match(usersView, /label: "UrMall"/);
  assert.match(usersView, /label: "UrRide"/);
  assert.match(usersView, /label: "Subscriptions"/);
});

test("admin preview includes a business owner, company-linked operator, and platform admin", () => {
  assert.match(previewData, /KTU-7F31-90C2-AB10/);
  assert.match(previewData, /KTU-4D20-88AE-19F1/);
  assert.match(previewData, /KTU-9B11-02FE-7A41/);
});

test("preview users search and campaign lookup stay scoped to the supplied KunThai ID", () => {
  assert.match(adminService, /normalizedValue = search\.replace/);
  assert.match(adminService, /normalizedPublicId = String\(item\.public_id/);
  assert.match(adminService, /const user = previewUsers\.find\(/);
  assert.match(adminService, /if \(!user\) return previewDelay\(null\)/);
});
