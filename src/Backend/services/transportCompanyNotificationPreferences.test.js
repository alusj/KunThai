import assert from "node:assert/strict";
import test from "node:test";

import {
  companyActivityNotificationEnabled,
  DEFAULT_COMPANY_NOTIFICATION_PREFERENCES,
  getCompanyActivityPreferenceKey,
} from "./transportCompanyNotificationModels.js";

// Must match push_company_activity_preference_key in the database
// (20261101130000_urride_company_new_booking_push.sql).
test("each company activity maps to the switch the push reads", () => {
  assert.equal(getCompanyActivityPreferenceKey({ activity_type: "trip_requested" }), "newBookings");
  assert.equal(getCompanyActivityPreferenceKey({ activity_type: "operator_invite_accepted" }), "operatorInvitations");
  assert.equal(getCompanyActivityPreferenceKey({ activity_type: "trip_status_updated", metadata: { status: "accepted" } }), "bookingAccepted");
  assert.equal(getCompanyActivityPreferenceKey({ activity_type: "trip_status_updated", metadata: '{"status":"cancelled"}' }), "tripCancelled");
  assert.equal(getCompanyActivityPreferenceKey({ activity_type: "something_else" }), "otherTripUpdates");
});

test("new bookings are on by default and follow their switch", () => {
  assert.equal(DEFAULT_COMPANY_NOTIFICATION_PREFERENCES.newBookings, true);
  const booking = { activity_type: "trip_requested" };
  assert.equal(companyActivityNotificationEnabled(booking, {}), true);
  assert.equal(companyActivityNotificationEnabled(booking, { newBookings: false }), false);
});
