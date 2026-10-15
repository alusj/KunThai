import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { pushTapRoute } from "./nativePushLogic.js";

// supabase/migrations/20261013140000_urride_push_deep_links.sql only produces
// routes that Transport.jsx already opens, keeps 'urride' as the fallback and
// leaves recipients, preferences and dedupe keys of the earlier push
// migrations unchanged. (Behaviour per role was checked against production in
// a rolled-back transaction; see the migration header.)

const read = (name) => readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8");
const links = read("20261013140000_urride_push_deep_links.sql");
const pushes = read("20261013120000_urmall_urride_native_push.sql");
const company = read("20261013130000_urride_company_activity_push.sql");
const transport = readFileSync(new URL("../../components/transport/Transport.jsx", import.meta.url), "utf8");

test("every UrRide route the migration builds is one Transport.jsx handles", () => {
  const prefixes = [...links.matchAll(/'(urride(?::[a-z-]+)*:?)'/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(prefixes)].sort(), ["urride", "urride:company-dashboard:", "urride:rental:", "urride:trip:"]);
  for (const destination of ["rental", "trip", "company-dashboard"]) {
    assert.match(transport, new RegExp(`destination === "${destination}"`), `${destination} handler exists`);
  }
  for (const route of ["urride", "urride:trip:t", "urride:rental:r", "urride:company-dashboard:c"]) {
    assert.deepEqual(pushTapRoute(route), { route, kind: "urride", fallback: false, reason: "" });
  }
});

test("ids are only added after a server-side check, with 'urride' as the fallback", () => {
  assert.match(links, /select trip\.passenger_id = p_recipient/, "passenger owns the trip");
  assert.match(links, /fleet\.operator_id = p_operator and operator\.user_id = p_recipient/, "the trip's vehicle is the operator's");
  assert.match(links, /company\.owner_user_id = p_recipient/);
  assert.match(links, /reservation\.customer_user_id = p_recipient/);
  assert.match(links, /explore_try_uuid/, "malformed ids are rejected");
  assert.equal((links.match(/else 'urride'\s+end/g) || []).length, 3, "trip, rental and company fall back to 'urride'");
});

test("recipients, preferences and dedupe keys are unchanged", () => {
  for (const key of ["'urride_operator_alert:' || new.id::text", "'urride_passenger:' || coalesce(new.trip_id, new.id)::text", "'platform_notification:' || new.id::text", "'urride_company_activity:' || new.id::text || ':' || recipient::text"]) {
    assert.ok(links.includes(key), `${key} kept`);
    assert.ok(pushes.includes(key) || company.includes(key), `${key} matches the applied migration`);
  }
  for (const check of ["push_transport_recipient_allows(v_user)", "push_transport_recipient_allows(new.passenger_id)", "recipient is distinct from new.actor_user_id", "transport_company_user_has_permission(new.company_id, 'view_company_activity', member.user_id)", "prefs.settings ->> v_key"]) {
    assert.ok(links.includes(check), `${check} kept`);
  }
  assert.doesNotMatch(links, /drop trigger|create trigger|alter table|drop function/i, "only functions are replaced");
});
