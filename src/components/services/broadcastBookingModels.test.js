import assert from "node:assert/strict";
import test from "node:test";

import {
  BROADCAST_POLL_MS,
  acceptReasonFromError,
  acceptReasonKey,
  broadcastView,
  chooseCreateMode,
  formatClock,
  nextPollDelay,
  normalizeBroadcastSnapshot,
  raisedOffer,
  requestChangeNoteKey,
  requestSecondsLeft,
  shouldFallBackToLegacy,
  snapshotFromCreateResult,
  snapshotFromTripRows,
} from "./broadcastBookingModels.js";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const iso = (offsetMs) => new Date(NOW + offsetMs).toISOString();

function serverSnapshot(overrides = {}) {
  return {
    open_booking_id: "g1",
    mode: "broadcast",
    status: "searching",
    wave: 1,
    max_wave: 4,
    radius_km: 5,
    max_radius_km: 30,
    notified_count: 12,
    pending_count: 12,
    created_at: iso(-10_000),
    wave_started_at: iso(-10_000),
    wave_expires_at: iso(35_000),
    server_now: iso(0),
    accepted: null,
    message: null,
    ...overrides,
  };
}

test("fallback decision: missing RPC or nobody reachable goes to the older open booking", () => {
  assert.equal(shouldFallBackToLegacy({ error: { code: "PGRST202", message: "Could not find the function" } }), true);
  assert.equal(shouldFallBackToLegacy({ error: { code: "42883" } }), true);
  assert.equal(shouldFallBackToLegacy({ error: { code: "P0001", message: "Add the fare you are offering." } }), false);
  assert.equal(shouldFallBackToLegacy({ data: { open_booking_id: null, notified_count: 0, reach: "none" } }), true);
  assert.equal(shouldFallBackToLegacy({ data: { open_booking_id: "g1", notified_count: 8 } }), false);
  assert.equal(shouldFallBackToLegacy({}), false);
});

test("create mode: rides now or soon broadcast, pickups far ahead use the older booking", () => {
  assert.equal(chooseCreateMode({ scheduledAt: "", now: NOW }), "broadcast");
  assert.equal(chooseCreateMode({ scheduledAt: iso(10 * 60_000), now: NOW }), "broadcast");
  assert.equal(chooseCreateMode({ scheduledAt: iso(2 * 3600_000), now: NOW }), "legacy");
  assert.equal(chooseCreateMode({ scheduledAt: "not a date", now: NOW }), "broadcast");
});

test("snapshot normalisation keeps the server clock and the accepted operator", () => {
  const snapshot = normalizeBroadcastSnapshot(serverSnapshot({
    status: "accepted",
    server_now: iso(3000),
    accepted: { trip_id: "t1", operator_name: "Ade", plate_number: "SL-1", vehicle: "Red Honda", distance_km: 1.2, eta_minutes: 5 },
  }), { receivedAt: NOW });
  assert.equal(snapshot.status, "accepted");
  assert.equal(snapshot.clockOffsetMs, 3000);
  assert.deepEqual(
    { name: snapshot.accepted.operatorName, plate: snapshot.accepted.plateNumber, km: snapshot.accepted.distanceKm, eta: snapshot.accepted.etaMinutes },
    { name: "Ade", plate: "SL-1", km: 1.2, eta: 5 },
  );
  assert.equal(normalizeBroadcastSnapshot(null), null);
  assert.equal(normalizeBroadcastSnapshot(serverSnapshot({ status: "weird" })).status, "searching");
});

test("searching view: elapsed timer, first ring, countdown to the next wave", () => {
  const view = broadcastView(normalizeBroadcastSnapshot(serverSnapshot(), { receivedAt: NOW }), { now: NOW });
  assert.equal(view.phase, "searching");
  assert.equal(view.elapsedLabel, "0:10");
  assert.equal(view.sentKey, "urrideBroadcastBooking.sentTo");
  assert.deepEqual(view.sentValues, { count: 12 });
  assert.equal(view.waveKey, "urrideBroadcastBooking.waveFirst");
  assert.deepEqual(view.waveValues, { radius: 5 });
  assert.equal(view.countdownKey, "urrideBroadcastBooking.nextWaveIn");
  assert.equal(view.secondsLeft, 35);
  assert.equal(view.expandDue, false);
});

test("wider waves, the last call and the moment to expand", () => {
  const wider = broadcastView(normalizeBroadcastSnapshot(serverSnapshot({ wave: 2, radius_km: 10 }), { receivedAt: NOW }), { now: NOW });
  assert.equal(wider.waveKey, "urrideBroadcastBooking.waveWider");
  assert.deepEqual(wider.waveValues, { radius: 10 });

  const last = broadcastView(normalizeBroadcastSnapshot(serverSnapshot({ wave: 4, radius_km: 30 }), { receivedAt: NOW }), { now: NOW });
  assert.equal(last.countdownKey, "urrideBroadcastBooking.lastWaveIn");

  const due = broadcastView(normalizeBroadcastSnapshot(serverSnapshot(), { receivedAt: NOW }), { now: NOW + 36_000 });
  assert.equal(due.secondsLeft, 0);
  assert.equal(due.expandDue, true);

  const one = broadcastView(normalizeBroadcastSnapshot(serverSnapshot({ notified_count: 1 }), { receivedAt: NOW }), { now: NOW });
  assert.equal(one.sentKey, "urrideBroadcastBooking.sentToOne");
});

test("settled and legacy views never ask to expand", () => {
  for (const status of ["accepted", "expired", "cancelled"]) {
    const view = broadcastView(normalizeBroadcastSnapshot(serverSnapshot({ status }), { receivedAt: NOW }), { now: NOW + 60_000 });
    assert.equal(view.phase, status);
    assert.equal(view.expandDue, false);
    assert.equal(view.countdownKey, "");
  }
  const legacy = broadcastView(snapshotFromCreateResult({ openBookingId: "g", notifiedCount: 5, mode: "legacy" }, { now: NOW }), { now: NOW + 5000 });
  assert.equal(legacy.waveKey, "");
  assert.equal(legacy.expandDue, false);
  assert.equal(legacy.elapsedLabel, "0:05");
});

test("create result seeds the sheet before the first status call", () => {
  const snapshot = snapshotFromCreateResult({ openBookingId: "g", notifiedCount: 9, radiusKm: 5, wave: 1, maxWave: 4, waveExpiresAt: iso(45_000), mode: "broadcast" }, { now: NOW });
  const view = broadcastView(snapshot, { now: NOW });
  assert.equal(view.secondsLeft, 45);
  assert.deepEqual(view.sentValues, { count: 9 });
});

test("trip rows -> state for older open bookings", () => {
  assert.equal(snapshotFromTripRows("g", [{ id: "a", status: "requested" }, { id: "b", status: "taken" }]).status, "searching");
  const accepted = snapshotFromTripRows("g", [{ id: "a", status: "accepted" }, { id: "b", status: "taken" }]);
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.accepted.tripId, "a");
  assert.equal(snapshotFromTripRows("g", [{ id: "a", status: "cancelled", ended_by: "passenger" }, { id: "b", status: "withdrawn" }]).status, "cancelled");
  assert.equal(snapshotFromTripRows("g", [{ id: "a", status: "expired" }]).status, "expired");
});

test("polling: every 5 s while visible, right at the wave end, never once settled or hidden", () => {
  const searching = normalizeBroadcastSnapshot(serverSnapshot(), { receivedAt: NOW });
  assert.equal(nextPollDelay(searching, { now: NOW }), BROADCAST_POLL_MS);
  assert.equal(nextPollDelay(searching, { now: NOW + 33_000 }), 2250);
  assert.equal(nextPollDelay(searching, { now: NOW, visible: false }), null);
  assert.equal(nextPollDelay({ ...searching, status: "accepted" }, { now: NOW }), null);
  assert.equal(nextPollDelay(null, { now: NOW }), BROADCAST_POLL_MS);
});

test("formatClock", () => {
  assert.equal(formatClock(0), "0:00");
  assert.equal(formatClock(65), "1:05");
  assert.equal(formatClock(-3), "0:00");
});

test("raise your fare: next offer up, then +15 % rounded", () => {
  const offers = { economy: 20, average: 25, priority: 30 };
  assert.deepEqual(raisedOffer({ choice: "economy", offers, amount: 20 }), { choice: "average", amount: 25 });
  assert.deepEqual(raisedOffer({ choice: "average", offers, amount: 25 }), { choice: "priority", amount: 30 });
  assert.deepEqual(raisedOffer({ choice: "priority", offers, amount: 30 }), { choice: "custom", amount: 35 });
  assert.deepEqual(raisedOffer({ choice: "custom", offers: null, amount: 200 }), { choice: "custom", amount: 230 });
  assert.equal(raisedOffer({ choice: "custom", offers: null, amount: 0 }), null);
});

test("operator accept outcomes map to one clear message", () => {
  assert.equal(acceptReasonKey("taken"), "urrideBroadcastBooking.acceptTaken");
  assert.equal(acceptReasonKey("withdrawn"), "urrideBroadcastBooking.acceptWithdrawn");
  assert.equal(acceptReasonKey("expired"), "urrideBroadcastBooking.acceptExpired");
  assert.equal(acceptReasonKey("whatever"), "urrideBroadcastBooking.acceptUnavailable");
  assert.equal(acceptReasonFromError(new Error("Another operator accepted this trip.")), "taken");
  assert.equal(acceptReasonFromError(new Error("Another operator already took this open booking.")), "taken");
  assert.equal(acceptReasonFromError({ code: "40P01", message: "deadlock detected" }), "taken");
  assert.equal(acceptReasonFromError(new Error("The passenger cancelled this request.")), "withdrawn");
  assert.equal(acceptReasonFromError(new Error("This request has expired.")), "expired");
  assert.equal(acceptReasonFromError(new Error("This open booking is no longer available.")), "unavailable");
  assert.equal(acceptReasonFromError(new Error("Network down")), null);
});

test("operator countdown and the note when a request disappears", () => {
  const row = { open_booking_id: "g", status: "requested", broadcast_expires_at: iso(42_000) };
  assert.equal(requestSecondsLeft(row, NOW), 42);
  assert.equal(requestSecondsLeft({ ...row, status: "accepted" }, NOW), null);
  assert.equal(requestSecondsLeft({ open_booking_id: "g", status: "requested" }, NOW), null);
  assert.equal(requestSecondsLeft(row, NOW + 60_000), 0);

  assert.equal(requestChangeNoteKey({ new: { open_booking_id: "g", status: "taken" }, old: { id: "t" } }), "urrideBroadcastBooking.opTakenNote");
  assert.equal(requestChangeNoteKey({ new: { open_booking_id: "g", status: "withdrawn" } }), "urrideBroadcastBooking.opWithdrawnNote");
  assert.equal(requestChangeNoteKey({ new: { open_booking_id: "g", status: "expired" }, old: { status: "requested" } }), "urrideBroadcastBooking.opExpiredNote");
  assert.equal(requestChangeNoteKey({ new: { open_booking_id: "g", status: "accepted" } }), "");
  assert.equal(requestChangeNoteKey({ new: { status: "taken" } }), "");
  assert.equal(requestChangeNoteKey({ new: { open_booking_id: "g", status: "taken" }, old: { status: "accepted" } }), "");
});
