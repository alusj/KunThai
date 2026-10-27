import assert from "node:assert/strict";
import test from "node:test";

import { URRIDE_LIVE_DISCOVERY } from "../../i18n/urrideLiveDiscovery.js";
import {
  availabilityLabelKey,
  resolveFleetAvailability,
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

test("the fleet that is online decides the work mode", () => {
  const both = { hasSoloFleet: true, hasCompanyFleet: true };
  assert.equal(resolveOperatorWorkMode({ ...both, soloActive: true, storedMode: "company" }), "solo");
  assert.equal(resolveOperatorWorkMode({ ...both, companyActive: true, storedMode: "solo" }), "company");
  assert.equal(resolveOperatorWorkMode({ ...both, storedMode: "company" }), "company");
  assert.equal(resolveOperatorWorkMode({ ...both }), "solo");
  assert.equal(resolveOperatorWorkMode({ hasSoloFleet: true, storedMode: "company" }), "solo");
  assert.equal(resolveOperatorWorkMode({ hasCompanyFleet: true, storedMode: "solo" }), "company");
});
