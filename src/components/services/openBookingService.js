import supabase from "../../Backend/lib/supabaseClient";
import { friendlyErrorMessage } from "../../Backend/services/friendlyErrorService";
import { getActiveCountryProfile } from "../../data/globalCountryProfiles";
import { fetchTransportFleets } from "./transportFleetService";
import { buildFareOffers, toDbFleetType } from "./openBookingModels";

export { buildFareOffers, collapseOpenBookingTrips, roundOfferAmount, toDbFleetType } from "./openBookingModels";

// UrRide open bookings: a ride or delivery request that is not addressed to a
// fleet. The server (create_transport_open_booking) picks the nearest online
// operators of the chosen vehicle type; the first to accept gets the trip and
// the others' requests are withdrawn automatically.

export const OPEN_BOOKING_CREATED_EVENT = "transport-open-booking-created";

export async function estimateOpenBookingFares({ mode, fleetType, distanceKm = 0 } = {}) {
  const fleets = await fetchTransportFleets({ mode, fleetType, includeOffline: true });
  return buildFareOffers(fleets, { distanceKm });
}

function isMissingOpenBookingFunction(error) {
  const text = `${error?.code || ""} ${error?.message || ""}`;
  return /PGRST202|create_transport_open_booking|could not find the function/i.test(text);
}

/**
 * Sends the open booking. Resolves with { openBookingId, notifiedCount,
 * radiusKm, tripIds }; notifiedCount 0 means nobody of that type is online
 * nearby and nothing was created.
 */
export async function createOpenBooking(booking) {
  const country = getActiveCountryProfile(booking.countryCode || booking.country);
  const pickup = booking.pickupPoint || {};
  const destination = booking.destinationPoint || {};

  const { data, error } = await supabase.rpc("create_transport_open_booking", {
    p_trip_type: booking.mode === "delivery" ? "delivery" : "ride",
    p_fleet_type: toDbFleetType(booking.fleetType),
    p_pickup_label: String(booking.pickup || "").trim(),
    p_pickup_lat: Number.isFinite(Number(pickup.lat)) ? Number(pickup.lat) : null,
    p_pickup_lng: Number.isFinite(Number(pickup.lng)) ? Number(pickup.lng) : null,
    p_destination_label: String(booking.dropoff || "").trim(),
    p_destination_lat: Number.isFinite(Number(destination.lat)) ? Number(destination.lat) : null,
    p_destination_lng: Number.isFinite(Number(destination.lng)) ? Number(destination.lng) : null,
    p_offer_amount: Number(booking.offerAmount) || null,
    p_currency: booking.currency || country.currency.code,
    p_country_iso: country.iso2,
    p_country_name: country.name,
    p_passenger_name: String(booking.passengerName || "").trim() || null,
    p_contact_phone: String(booking.phone || "").trim() || null,
    p_package_description: booking.mode === "delivery" ? String(booking.packageDescription || "").trim() || null : null,
    p_trip_note: String(booking.note || "").trim() || null,
    p_passenger_count: Number(booking.passengers) || 1,
    p_estimated_distance_km: Number(booking.distanceKm) > 0 ? Number(Number(booking.distanceKm).toFixed(3)) : null,
    p_scheduled_at: null,
  });

  if (error) {
    if (isMissingOpenBookingFunction(error)) {
      throw new Error("Open booking is not available yet. Please try again later.");
    }
    throw new Error(friendlyErrorMessage(error, "Unable to send this open booking."));
  }

  const result = {
    openBookingId: data?.open_booking_id || "",
    notifiedCount: Number(data?.notified_count || 0),
    radiusKm: data?.radius_km == null ? null : Number(data.radius_km),
    tripIds: Array.isArray(data?.trip_ids) ? data.trip_ids : [],
  };

  if (result.notifiedCount > 0 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("transport-booking-created", { detail: { openBooking: result } }));
    window.dispatchEvent(new CustomEvent(OPEN_BOOKING_CREATED_EVENT, { detail: result }));
  }
  return result;
}
