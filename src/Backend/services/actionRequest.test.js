import assert from "node:assert/strict";
import test from "node:test";

import { isActionRequest } from "./actionRequest.js";

const api = "https://example.supabase.co";
const post = { method: "POST" };

test("saving, assigning and uploading are actions", () => {
  assert.equal(isActionRequest(`${api}/rest/v1/rpc/accept_transport_company_operator_invite`, post), true);
  assert.equal(isActionRequest(`${api}/rest/v1/rpc/transport_company_assign_role`, post), true);
  assert.equal(isActionRequest(`${api}/rest/v1/transport_company_operator_invites?id=eq.1`, { method: "PATCH" }), true);
  assert.equal(isActionRequest(`${api}/rest/v1/explore_posts`, post), true);
  assert.equal(isActionRequest(`${api}/storage/v1/object/explore-media/a.jpg`, post), true);
});

test("reads, lookups and background writes are not actions", () => {
  assert.equal(isActionRequest(`${api}/rest/v1/explore_posts?select=*`), false);
  assert.equal(isActionRequest(`${api}/rest/v1/rpc/get_transport_operator_company_access`, post), false);
  assert.equal(isActionRequest(`${api}/rest/v1/rpc/resolve_kunthai_code`, post), false);
  assert.equal(isActionRequest(`${api}/rest/v1/rpc/transport_track_operator`, post), false);
  assert.equal(isActionRequest(`${api}/rest/v1/rpc/record_explore_ad_event`, post), false);
  assert.equal(isActionRequest(`${api}/rest/v1/rpc/increment_marketplace_product_view`, post), false);
  assert.equal(isActionRequest(`${api}/rest/v1/rpc/live_location_share_update`, post), false);
  assert.equal(isActionRequest(`${api}/rest/v1/transport_operator_locations`, post), false);
  assert.equal(isActionRequest(`${api}/rest/v1/push_subscriptions`, post), false);
  assert.equal(isActionRequest(`${api}/rest/v1/marketplace_buyer_signals`, post), false);
});
