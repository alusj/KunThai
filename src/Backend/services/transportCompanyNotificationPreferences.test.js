import assert from "node:assert/strict";
import test from "node:test";

import {
  companyActivityNotificationEnabled,
  DEFAULT_COMPANY_NOTIFICATION_PREFERENCES,
  getCompanyActivityPreferenceKey,
  isCompanyInboxActivity,
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

test("an operator leaving or deleting their account has its own switch and shows in the company inbox", () => {
  for (const type of ["operator_left_company", "operator_deleted_account"]) {
    const activity = { activity_type: type };
    assert.equal(getCompanyActivityPreferenceKey(activity), "operatorDepartures");
    assert.equal(isCompanyInboxActivity(activity), true);
    assert.equal(companyActivityNotificationEnabled(activity, {}), true);
    assert.equal(companyActivityNotificationEnabled(activity, { operatorDepartures: false }), false);
  }
  assert.equal(isCompanyInboxActivity({ activity_type: "operator_invite_accepted" }), true);
  assert.equal(isCompanyInboxActivity({ activity_type: "trip_status_updated" }), true);
  assert.equal(isCompanyInboxActivity({ activity_type: "trip_requested" }), false);
});
