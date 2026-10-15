import supabase from "../../Backend/lib/supabaseClient";
import { friendlyErrorMessage } from "../../Backend/services/friendlyErrorService";
import { cancelTransportTrip, updateTransportTripStatus } from "./bookingService";
import { announceOpenBooking, buildOpenBookingParams, createOpenBooking } from "./openBookingService";
import {
  acceptReasonFromError,
  chooseCreateMode,
  isMissingRpcError,
  normalizeBroadcastSnapshot,
  shouldFallBackToLegacy,
  snapshotFromTripRows,
} from "./broadcastBookingModels";

// UrRide broadcast bookings: the request goes to every available operator
// nearby at once and the first to accept gets the trip. Every call falls back
// to the older open booking when the 2026-10-15 migration is not applied yet.

let broadcastUnavailable = false;

function markMissing(error) {
  if (isMissingRpcError(error)) {
    broadcastUnavailable = true;
    return true;
  }
  return false;
}

/**
 * Sends the booking. Resolves with { openBookingId, notifiedCount, radiusKm,
 * wave, maxWave, waveExpiresAt, mode: "broadcast" | "legacy", tripIds }.
 * notifiedCount 0 means nobody of that type could be reached at all.
 */
export async function createBroadcastBooking(booking) {
  if (broadcastUnavailable || chooseCreateMode({ scheduledAt: booking.scheduledAt }) === "legacy") {
    return withMode(await createOpenBooking(booking), "legacy");
  }

  const { data, error } = await supabase.rpc("create_transport_broadcast_booking", buildOpenBookingParams(booking));
  if (shouldFallBackToLegacy({ error, data })) {
    markMissing(error);
    return withMode(await createOpenBooking(booking), "legacy");
  }
  if (error) throw new Error(friendlyErrorMessage(error, "Unable to send this open booking."));

  const result = {
    openBookingId: data.open_booking_id || "",
    notifiedCount: Number(data.notified_count || 0),
    radiusKm: data.radius_km == null ? null : Number(data.radius_km),
    reach: data.reach || "broadcast",
    wave: Number(data.wave || 1),
    maxWave: Number(data.max_wave || 4),
    waveExpiresAt: data.wave_expires_at || null,
    tripIds: Array.isArray(data.trip_ids) ? data.trip_ids : [],
    mode: "broadcast",
  };
  if (result.notifiedCount > 0) announceOpenBooking(result);
  return result;
}

function withMode(result, mode) {
  return { ...result, mode, wave: null, maxWave: null, waveExpiresAt: null };
}

async function legacySnapshot(openBookingId) {
  const { data, error } = await supabase
    .from("transport_trips")
    .select("id, status, ended_by")
    .eq("open_booking_id", openBookingId);
  if (error) throw new Error(friendlyErrorMessage(error, "Unable to load this booking."));
  return snapshotFromTripRows(openBookingId, data || []);
}

/**
 * Current state of the booking. Calling it also lets the server open the next
 * wave or expire the booking when that is due, so polling drives the waves.
 */
export async function fetchBroadcastStatus(openBookingId, { expand = false } = {}) {
  if (!openBookingId) return null;
  if (broadcastUnavailable) return legacySnapshot(openBookingId);
  const receivedAt = Date.now();
  const { data, error } = await supabase.rpc(
    expand ? "expand_transport_broadcast_booking" : "transport_broadcast_booking_status",
    { p_open_booking_id: openBookingId },
  );
  if (error) {
    if (markMissing(error)) return legacySnapshot(openBookingId);
    throw new Error(friendlyErrorMessage(error, "Unable to load this booking."));
  }
  return normalizeBroadcastSnapshot(data, { receivedAt });
}

/** Passenger cancels while searching: every request is withdrawn at once. */
export async function cancelBroadcastBooking(openBookingId, tripIds = []) {
  if (!broadcastUnavailable) {
    const { data, error } = await supabase.rpc("cancel_transport_broadcast_booking", { p_open_booking_id: openBookingId });
    if (!error) {
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("transport-trip-updated", { detail: { openBookingId } }));
      return normalizeBroadcastSnapshot(data);
    }
    if (!markMissing(error)) throw new Error(friendlyErrorMessage(error, "Unable to cancel this booking."));
  }
  // Older database: cancelling one waiting request withdraws the whole group.
  const snapshot = await legacySnapshot(openBookingId);
  if (snapshot.status !== "searching") return snapshot;
  const { data: rows } = await supabase
    .from("transport_trips")
    .select("id, status")
    .eq("open_booking_id", openBookingId)
    .in("status", ["requested", "waiting_operator", "pending_confirmation"])
    .limit(1);
  const tripId = rows?.[0]?.id || tripIds[0];
  if (tripId) await cancelTransportTrip(tripId);
  return legacySnapshot(openBookingId);
}

/**
 * Operator accepts an open request. Resolves with { ok, reason, trip }; a
 * request someone else took (or that is gone) is { ok: false, reason } and
 * never throws, so the screen shows one clear message.
 */
export async function acceptOpenBookingRequest(trip, patch = {}) {
  const fareAmount = patch.fareAmount === undefined || patch.fareAmount === "" ? null : Number(patch.fareAmount);
  if (!broadcastUnavailable) {
    const { data, error } = await supabase.rpc("accept_transport_broadcast_request", {
      p_trip_id: trip.id,
      p_fare_amount: Number.isFinite(fareAmount) && fareAmount > 0 ? fareAmount : null,
      p_fare_currency: patch.fareCurrency || null,
    });
    if (!error) {
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("transport-trip-updated", { detail: { trip: data?.trip || null } }));
      return { ok: Boolean(data?.ok), reason: data?.reason || null, trip: data?.trip || null };
    }
    if (!markMissing(error)) {
      const reason = acceptReasonFromError(error);
      if (reason) return { ok: false, reason, trip: null };
      throw new Error(friendlyErrorMessage(error, "Unable to update this trip."));
    }
  }
  try {
    const updated = await updateTransportTripStatus(trip.id, "accepted", patch);
    return { ok: true, reason: null, trip: updated };
  } catch (error) {
    const reason = acceptReasonFromError(error);
    if (reason) return { ok: false, reason, trip: null };
    throw error;
  }
}

/** Realtime: any change to the requests of this booking. */
export function subscribeBroadcastBooking(openBookingId, onChange) {
  if (!openBookingId || typeof onChange !== "function") return () => {};
  const channel = supabase
    .channel(`transport-broadcast-${openBookingId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "transport_trips", filter: `open_booking_id=eq.${openBookingId}` }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
