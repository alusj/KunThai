// Pure helpers for UrRide broadcast bookings (first operator to accept wins).
// No app imports beyond other pure helpers, so they run under node --test.
//
// The database owns the truth (create_transport_broadcast_booking,
// transport_broadcast_booking_status, accept_transport_broadcast_request);
// these decide when to fall back to the older open booking, turn the server
// snapshot into what the "Finding an operator" sheet shows, pace the polling,
// and map operator-side outcomes to one clear message.

import { isMissingRpcError } from "./liveDiscovery.js";

export { isMissingRpcError };

export const BROADCAST_POLL_MS = 5000;
export const BROADCAST_WAVE_SECONDS = 45;
// A scheduled pickup further ahead than this goes out as an older open
// booking: a 45-second broadcast makes no sense for a ride hours away.
export const BROADCAST_MAX_LEAD_MS = 15 * 60 * 1000;

const WAITING = ["requested", "waiting_operator", "pending_confirmation"];
const WON = ["accepted", "arrived", "start_requested", "in_progress", "paused", "completed"];

/**
 * Which RPC creates the booking. "legacy" for a pickup scheduled well ahead,
 * otherwise "broadcast" (the caller falls back when that RPC is missing or
 * finds nobody available).
 */
export function chooseCreateMode({ scheduledAt = "", now = Date.now() } = {}) {
  if (!scheduledAt) return "broadcast";
  const at = new Date(scheduledAt).getTime();
  if (!Number.isFinite(at)) return "broadcast";
  return at - now > BROADCAST_MAX_LEAD_MS ? "legacy" : "broadcast";
}

/**
 * After calling create_transport_broadcast_booking: should the app send the
 * older open booking instead? Yes when the function does not exist yet
 * (migration not applied) or when nobody is available within 30 km (the
 * older booking reaches further, to fleets without a live position).
 */
export function shouldFallBackToLegacy({ error = null, data = null } = {}) {
  if (error) return isMissingRpcError(error);
  if (!data) return false;
  return !data.open_booking_id && Number(data.notified_count || 0) === 0;
}

function toTime(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Server snapshot (jsonb) -> plain object the sheet reads. */
export function normalizeBroadcastSnapshot(data, { receivedAt = Date.now() } = {}) {
  if (!data || typeof data !== "object") return null;
  const accepted = data.accepted && typeof data.accepted === "object" ? data.accepted : null;
  const serverNow = toTime(data.server_now);
  return {
    openBookingId: data.open_booking_id || "",
    mode: data.mode === "legacy" ? "legacy" : "broadcast",
    status: ["searching", "accepted", "expired", "cancelled"].includes(data.status) ? data.status : "searching",
    wave: toNumber(data.wave),
    maxWave: toNumber(data.max_wave),
    radiusKm: toNumber(data.radius_km),
    maxRadiusKm: toNumber(data.max_radius_km),
    notifiedCount: Number(data.notified_count || 0),
    pendingCount: Number(data.pending_count || 0),
    createdAt: toTime(data.created_at),
    waveExpiresAt: toTime(data.wave_expires_at),
    // Server clock minus ours, so countdowns do not drift with a wrong phone clock.
    clockOffsetMs: serverNow === null ? 0 : serverNow - receivedAt,
    message: data.message || "",
    accepted: accepted
      ? {
          tripId: accepted.trip_id || "",
          status: accepted.status || "accepted",
          operatorName: accepted.operator_name || "",
          fleetName: accepted.fleet_name || "",
          fleetType: accepted.fleet_type || "",
          vehicle: accepted.vehicle || "",
          plateNumber: accepted.plate_number || "",
          distanceKm: toNumber(accepted.distance_km),
          etaMinutes: toNumber(accepted.eta_minutes),
        }
      : null,
  };
}

/** Builds a snapshot from the create result, before the first status call. */
export function snapshotFromCreateResult(result, { now = Date.now() } = {}) {
  if (!result) return null;
  const waveExpiresAt = toTime(result.waveExpiresAt);
  return {
    openBookingId: result.openBookingId || "",
    mode: result.mode === "legacy" ? "legacy" : "broadcast",
    status: "searching",
    wave: toNumber(result.wave),
    maxWave: toNumber(result.maxWave),
    radiusKm: toNumber(result.radiusKm),
    maxRadiusKm: null,
    notifiedCount: Number(result.notifiedCount || 0),
    pendingCount: Number(result.notifiedCount || 0),
    createdAt: now,
    waveExpiresAt: result.mode === "legacy" ? null : waveExpiresAt ?? now + BROADCAST_WAVE_SECONDS * 1000,
    clockOffsetMs: 0,
    message: "",
    accepted: null,
  };
}

/**
 * Older open booking without the status RPC: derive the state from the
 * passenger's own trip rows of the group.
 */
export function snapshotFromTripRows(openBookingId, rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const winner = list.find((row) => WON.includes(row?.status));
  const pending = list.filter((row) => WAITING.includes(row?.status)).length;
  const cancelled = list.some((row) => row?.status === "withdrawn" || (row?.status === "cancelled" && row?.ended_by === "passenger"));
  return {
    openBookingId,
    mode: "legacy",
    status: winner ? "accepted" : pending ? "searching" : cancelled ? "cancelled" : list.length ? "expired" : "searching",
    wave: null,
    maxWave: null,
    radiusKm: null,
    maxRadiusKm: null,
    notifiedCount: list.length,
    pendingCount: pending,
    createdAt: null,
    waveExpiresAt: null,
    clockOffsetMs: 0,
    message: "",
    accepted: winner ? { tripId: winner.id, status: winner.status, operatorName: "", fleetName: "", fleetType: "", vehicle: "", plateNumber: "", distanceKm: null, etaMinutes: null } : null,
  };
}

/** "m:ss" for the elapsed timer and the operator countdown. */
export function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * What the sheet shows right now. Returns translation keys and their values,
 * so the component only renders:
 *   phase: searching | accepted | expired | cancelled
 *   waveKey / waveValues: "Searching within 5 km…" or "Searching a wider area (10 km)…"
 *   countdownKey / countdownValues: time left in this wave (next widening or last call)
 *   expandDue: the wave is over and the app should ask the server to widen
 */
export function broadcastView(snapshot, { now = Date.now(), startedAt = null } = {}) {
  if (!snapshot) {
    return { phase: "searching", elapsedSeconds: 0, elapsedLabel: "0:00", sentKey: "", sentValues: {}, waveKey: "", waveValues: {}, countdownKey: "", countdownValues: {}, secondsLeft: null, expandDue: false };
  }
  const serverNow = now + (snapshot.clockOffsetMs || 0);
  const origin = snapshot.createdAt ?? startedAt ?? now;
  const elapsedSeconds = Math.max(0, Math.floor((serverNow - origin) / 1000));
  const phase = snapshot.status;
  const sentKey = snapshot.notifiedCount === 1 ? "urrideBroadcastBooking.sentToOne" : "urrideBroadcastBooking.sentTo";
  const sentValues = { count: snapshot.notifiedCount };

  let waveKey = "";
  let waveValues = {};
  let countdownKey = "";
  let countdownValues = {};
  let secondsLeft = null;
  let expandDue = false;

  if (phase === "searching" && snapshot.mode === "broadcast" && snapshot.radiusKm !== null) {
    waveKey = (snapshot.wave || 1) > 1 ? "urrideBroadcastBooking.waveWider" : "urrideBroadcastBooking.waveFirst";
    waveValues = { radius: snapshot.radiusKm };
    if (snapshot.waveExpiresAt !== null) {
      secondsLeft = Math.max(0, Math.ceil((snapshot.waveExpiresAt - serverNow) / 1000));
      const lastWave = snapshot.maxWave !== null && (snapshot.wave || 1) >= snapshot.maxWave;
      countdownKey = lastWave ? "urrideBroadcastBooking.lastWaveIn" : "urrideBroadcastBooking.nextWaveIn";
      countdownValues = { seconds: secondsLeft };
      expandDue = secondsLeft <= 0;
    }
  }

  return { phase, elapsedSeconds, elapsedLabel: formatClock(elapsedSeconds), sentKey, sentValues, waveKey, waveValues, countdownKey, countdownValues, secondsLeft, expandDue };
}

/**
 * Pacing: poll every 5 s while the sheet is visible and the booking is still
 * searching; ask right away (once per wave) when the wave ends; stop once the
 * booking is settled.
 */
export function nextPollDelay(snapshot, { now = Date.now(), visible = true } = {}) {
  if (!visible) return null;
  if (snapshot && snapshot.status !== "searching") return null;
  if (snapshot?.waveExpiresAt) {
    const untilWaveEnd = snapshot.waveExpiresAt - (now + (snapshot.clockOffsetMs || 0));
    if (untilWaveEnd > 0 && untilWaveEnd < BROADCAST_POLL_MS) return Math.max(250, Math.ceil(untilWaveEnd) + 250);
  }
  return BROADCAST_POLL_MS;
}

/** Next fare step for "Raise your fare": economy -> average -> priority -> +15 %. */
export function raisedOffer({ choice = "average", offers = null, amount = 0 } = {}) {
  const order = ["economy", "average", "priority"];
  const index = order.indexOf(choice);
  if (offers && index >= 0 && index < order.length - 1) {
    const next = order[index + 1];
    if (Number(offers[next]) > Number(amount || 0)) return { choice: next, amount: Number(offers[next]) };
  }
  const base = Number(amount) > 0 ? Number(amount) : Number(offers?.priority || 0);
  if (!(base > 0)) return null;
  const raised = base * 1.15;
  const rounded = raised >= 100 ? Math.ceil(raised / 5) * 5 : Math.ceil(raised);
  return { choice: "custom", amount: Math.max(rounded, base + 1) };
}

// Operator side --------------------------------------------------------------

const REASON_KEYS = {
  taken: "urrideBroadcastBooking.acceptTaken",
  withdrawn: "urrideBroadcastBooking.acceptWithdrawn",
  expired: "urrideBroadcastBooking.acceptExpired",
  unavailable: "urrideBroadcastBooking.acceptUnavailable",
};

export function acceptReasonKey(reason) {
  return REASON_KEYS[reason] || REASON_KEYS.unavailable;
}

/**
 * A failed accept through the older direct update (or a raised error) ->
 * the same reason the RPC would give, or null for any other error.
 * A deadlock between two accepts means the other operator won.
 */
export function acceptReasonFromError(error) {
  if (!error) return null;
  const text = `${error.code || ""} ${error.message || ""}`;
  if (/Another operator (accepted this trip|already took this open booking)|40P01|deadlock detected/i.test(text)) return "taken";
  if (/passenger cancelled this request/i.test(text)) return "withdrawn";
  if (/request has expired/i.test(text)) return "expired";
  if (/no longer available/i.test(text)) return "unavailable";
  return null;
}

export function isBroadcastRequest(row) {
  return Boolean(row?.open_booking_id && row?.broadcast_expires_at);
}

/** Seconds a waiting broadcast request still has, or null when it has no expiry. */
export function requestSecondsLeft(row, now = Date.now()) {
  if (!isBroadcastRequest(row) || !WAITING.includes(row.status || "requested")) return null;
  const at = toTime(row.broadcast_expires_at);
  if (at === null) return null;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

/**
 * Realtime change on the operator's own trips: a waiting open request that
 * just became taken / withdrawn / expired -> the short note to show.
 */
export function requestChangeNoteKey(payload) {
  const next = payload?.new;
  const previous = payload?.old;
  if (!next?.open_booking_id) return "";
  if (previous?.status && !WAITING.includes(previous.status)) return "";
  if (next.status === "taken") return "urrideBroadcastBooking.opTakenNote";
  if (next.status === "withdrawn") return "urrideBroadcastBooking.opWithdrawnNote";
  if (next.status === "expired") return "urrideBroadcastBooking.opExpiredNote";
  return "";
}
