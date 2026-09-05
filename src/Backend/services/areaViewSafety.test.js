import assert from "node:assert/strict";
import test from "node:test";

import {
  LATE_ROUTE_END_HOUR,
  LATE_ROUTE_START_HOUR,
  isLateRouteHour,
} from "../../components/transport/areaViewSafety.js";

function atLocalTime(hours, minutes = 0) {
  return new Date(2026, 8, 5, hours, minutes, 0, 0);
}

test("Area View late-route warning starts at 8 PM", () => {
  assert.equal(LATE_ROUTE_START_HOUR, 20);
  assert.equal(isLateRouteHour(atLocalTime(19, 59)), false);
  assert.equal(isLateRouteHour(atLocalTime(20)), true);
});

test("Area View late-route warning remains active until 5 AM", () => {
  assert.equal(LATE_ROUTE_END_HOUR, 5);
  assert.equal(isLateRouteHour(atLocalTime(4, 59)), true);
  assert.equal(isLateRouteHour(atLocalTime(5)), false);
});
