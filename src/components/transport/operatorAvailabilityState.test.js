import assert from "node:assert/strict";
import test from "node:test";

import { URRIDE_LIVE_DISCOVERY } from "../../i18n/urrideLiveDiscovery.js";
import {
  availabilityLabelKey,
  findOnlineElsewhere,
  resolveFleetAvailability,
  resolveOperatorCompanyChoice,
  resolveOperatorWorkMode,
  shouldPreserveAvailabilityOverride,
} from "./operatorAvailabilityState.js";

test("availability label follows the saved state, and names the change while saving", () => {
  assert.equal(availabilityLabelKey({ active: false }), "statusOffline");
  assert.equal(availabilityLabelKey({ active: true }), "statusOnline");
  // Tapping while offline: still offline until Supabase confirms, says "Going online…".
  assert.equal(availabilityLabelKey({ active: false, saving: true }), "statusGoingOnline");
  assert.equal(availabilityLabelKey({ active: true, saving: true }), "statusGoingOffline");
});

test("the availability label never claims passengers can see the operator", () => {
  for (const [locale, strings] of Object.entries(URRIDE_LIVE_DISCOVERY)) {
    for (const key of ["statusOnline", "statusOffline", "statusGoingOnline", "statusGoingOffline"]) {
      assert.ok(strings[key], `${locale}.${key}`);
      assert.notEqual(strings[key], strings.passengersVisible, `${locale}.${key}`);
    }
  }
  assert.doesNotMatch(Object.values(URRIDE_LIVE_DISCOVERY.en).filter((value, index, all) => all.indexOf(value) === index && /^(Online|Offline|Going)/.test(value)).join(" "), /visible|passenger/i);
});

test("the saved fleet row is the authority; the request only fills a missing status", () => {
  assert.equal(resolveFleetAvailability({ active_status: "active" }, false), true);
  assert.equal(resolveFleetAvailability({ active_status: "offline" }, true), false);
  assert.equal(resolveFleetAvailability({}, true), true);
  assert.equal(resolveFleetAvailability(null, false), false);
});

test("returning to the dashboard: a stale refresh can't undo a just-saved change, an old one can't linger", () => {
  const now = 1_000_000;
  const justSaved = { active: true, expiresAt: now + 5000 };
  // A refresh that raced the save still reports offline: keep the saved online state.
  assert.equal(shouldPreserveAvailabilityOverride(justSaved, false, now), true);
  // The server agrees: nothing to preserve.
  assert.equal(shouldPreserveAvailabilityOverride(justSaved, true, now), false);
  // After the grace window the server wins (e.g. went offline on another device).
  assert.equal(shouldPreserveAvailabilityOverride(justSaved, false, now + 6000), false);
  assert.equal(shouldPreserveAvailabilityOverride(null, false, now), false);
});

test("an operator online solo stays solo; otherwise their choice decides", () => {
  const both = { hasSoloFleet: true, hasCompanyFleet: true };
  assert.equal(resolveOperatorWorkMode({ ...both, soloActive: true, storedMode: "company" }), "solo");
  assert.equal(resolveOperatorWorkMode({ ...both, storedMode: "company" }), "company");
  assert.equal(resolveOperatorWorkMode({ ...both, storedMode: "solo" }), "solo");
  assert.equal(resolveOperatorWorkMode({ ...both }), "solo");
  assert.equal(resolveOperatorWorkMode({ hasSoloFleet: true, storedMode: "company" }), "solo");
  assert.equal(resolveOperatorWorkMode({ hasCompanyFleet: true, storedMode: "solo" }), "company");
});

test("several companies: the picked company stays picked", () => {
  const companies = [{ companyId: "c1" }, { companyId: "c2", active: true }, { companyId: "c3" }];
  assert.equal(resolveOperatorCompanyChoice(companies, "c3"), "c3");
  // No (or a stale) pick: the company they are online for, then the most recent.
  assert.equal(resolveOperatorCompanyChoice(companies, "gone"), "c2");
  assert.equal(resolveOperatorCompanyChoice([{ companyId: "c1" }, { companyId: "c3" }], ""), "c1");
  assert.equal(resolveOperatorCompanyChoice([], "c1"), "");
});

test("only one dashboard online: going online here names the other one", () => {
  const companies = [{ companyId: "c1", companyName: "Bo Taxis", active: true }, { companyId: "c2" }];
  assert.deepEqual(
    findOnlineElsewhere({ current: { mode: "solo" }, companies }),
    { mode: "company", companyId: "c1", companyName: "Bo Taxis" },
  );
  assert.equal(findOnlineElsewhere({ current: { mode: "company", companyId: "c1" }, companies }), null);
  assert.equal(findOnlineElsewhere({ current: { mode: "company", companyId: "c2" }, companies })?.companyId, "c1");
  assert.deepEqual(findOnlineElsewhere({ current: { mode: "company", companyId: "c2" }, soloActive: true }), { mode: "solo", companyId: "" });
  assert.equal(findOnlineElsewhere({ current: { mode: "solo" }, soloActive: true, companies: [] }), null);
});
