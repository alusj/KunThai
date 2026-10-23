// UrRide parcel hand-over (2026-10-22). A delivery is collected with the
// sender's pickup code and closed with the receiver's drop-off code; the
// sender and the receiver (through a public link) can follow the rider.
// Server side: supabase/migrations/20261022140000_urride_parcel_handover.sql.

import supabase from "../../Backend/lib/supabaseClient";
import { friendlyErrorMessage } from "../../Backend/services/friendlyErrorService";
import { publicAppOrigin } from "../../Backend/services/nativeShare";
import { markTransportParcelCollected, updateTransportTripStatus } from "./bookingService";

const TRACK_PATH = "/track/";

// Before the migration is applied the functions do not exist yet; the app
// then keeps working without codes instead of blocking every delivery.
function isMissingFunction(error) {
  return error?.code === "PGRST202" || /could not find the function/i.test(error?.message || "");
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeParcelTracking(row) {
  if (!row || typeof row !== "object") return null;
  return {
    status: row.status || "",
    pickupCode: row.pickup_code || "",
    dropoffCode: row.dropoff_code || "",
    trackingToken: row.tracking_token || "",
    receiverPhone: row.receiver_phone || "",
    collectedAt: row.collected_at || "",
    deliveredAt: row.delivered_at || "",
    riderLat: toNumberOrNull(row.rider_lat),
    riderLng: toNumberOrNull(row.rider_lng),
    riderLocatedAt: row.rider_located_at || "",
    title: row.title || "",
    pickupLabel: row.pickup_label || "",
    destinationLabel: row.destination_label || "",
    riderName: row.rider_name || "",
    fleetType: row.fleet_type || "",
    plateNumber: row.plate_number || "",
  };
}

/** Sender: codes, the receiver link token and the rider's live position. */
export async function fetchParcelTracking(tripId) {
  if (!tripId) return null;
  const { data, error } = await supabase.rpc("transport_parcel_tracking", { p_trip_id: tripId });
  if (error) {
    if (isMissingFunction(error)) return null;
    throw new Error(friendlyErrorMessage(error, "Unable to load parcel tracking."));
  }
  return normalizeParcelTracking(data);
}

/** Receiver (no sign-in): what the tracking link shows. */
export async function fetchPublicParcelTracking(token) {
  if (!token) return null;
  const { data, error } = await supabase.rpc("transport_public_parcel_tracking", { p_token: token });
  if (error) throw new Error(friendlyErrorMessage(error, "Unable to load this parcel."));
  return normalizeParcelTracking(data);
}

function announceTripUpdate(tripId) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("transport-trip-updated", { detail: { trip: { id: tripId } } }));
}

// { ok: true } or { ok: false, reason: "wrong_code" | "locked" | "wrong_status", attemptsLeft }.
async function runHandover(rpcName, tripId, code, fallback) {
  const { data, error } = await supabase.rpc(rpcName, { p_trip_id: tripId, p_code: String(code || "").trim() });
  if (error) {
    if (isMissingFunction(error)) {
      await fallback();
      announceTripUpdate(tripId);
      return { ok: true };
    }
    throw new Error(friendlyErrorMessage(error, "Unable to update this delivery."));
  }
  const result = {
    ok: Boolean(data?.ok),
    reason: data?.reason || "",
    attemptsLeft: data?.attempts_left ?? null,
  };
  if (result.ok) announceTripUpdate(tripId);
  return result;
}

/** Operator: the sender's pickup code moves the delivery to in_progress. */
export function collectParcel(tripId, code) {
  return runHandover("transport_parcel_collect", tripId, code, () => markTransportParcelCollected(tripId));
}

/** Operator: the receiver's drop-off code completes the delivery. */
export function deliverParcel(tripId, code) {
  return runHandover("transport_parcel_deliver", tripId, code, () =>
    updateTransportTripStatus(tripId, "completed", { endedBy: "operator" }));
}

// Served by src/main.jsx (PublicParcelTrackingPage).
export function buildParcelTrackingUrl(token) {
  return token ? `${publicAppOrigin()}${TRACK_PATH}${encodeURIComponent(token)}` : "";
}

/** A text message to the receiver, prefilled when the sender gave the number. */
export function buildReceiverSmsUrl(phone, body) {
  const number = String(phone || "").replace(/[^\d+]/g, "");
  if (!number) return "";
  // iOS reads "&body=", Android "?body="; "?&body=" works on both.
  return `sms:${number}?&body=${encodeURIComponent(body)}`;
}

export function mapsUrlFor(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
