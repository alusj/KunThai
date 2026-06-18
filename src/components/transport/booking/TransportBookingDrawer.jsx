import { createElement, useEffect, useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiBox,
  FiClock,
  FiCreditCard,
  FiMapPin,
  FiNavigation,
  FiPhone,
  FiRefreshCw,
  FiSend,
  FiTruck,
  FiUser,
  FiX,
} from "react-icons/fi";

import AppPortal from "../../shared/AppPortal";
import {
  AddressAreaResolutionCard,
  AddressAreaStatusIcon,
  normalizeAreaLocation,
  useAddressAreaValidation,
} from "../../shared/AddressAreaValidation";
import NearbyAreaScreen from "../NearbyAreaScreen";
import { searchLocations } from "../../../Backend/services/locationSearchService";
import { getCountryPhonePlaceholder } from "../../../data/westAfricanCountryProfiles";
import { createTransportBooking } from "../../services/bookingService";
import { fetchTransportFleets } from "../../services/transportFleetService";
import {
  calculateBookingRoute,
  describeFleetFare,
  formatBookingDistance,
} from "../../services/transportPricingService";

const PASSENGER_CAUTION_KEY = "kunthai-passenger-booking-caution-accepted";

const fleetTypes = [
  { value: "", label: "Any active fleet" },
  { value: "Motorcycle", label: "Bike / motorcycle" },
  { value: "Tricycle", label: "Tricycle" },
  { value: "Car", label: "Taxi / van" },
];

function modeForFleet(fleet, fallback = "ride") {
  if (fallback === "delivery") return "delivery";
  if (fallback === "ride") return "ride";
  if (fleet?.serviceCategory === "Delivery") return "delivery";
  return "ride";
}

function selectionFromTarget(target) {
  if (target?.fleet) {
    const mode = target.fleet.serviceCategory === "Delivery" ? "delivery" : "ride";
    return {
      mode,
      fleetType: target.fleet.fleetType || null,
      label: target.fleet.displayType || target.fleet.fleetType || "Selected fleet",
    };
  }

  return {
    mode: target?.selection?.mode === "delivery" ? "delivery" : target?.selection?.mode === "ride" ? "ride" : "topRated",
    fleetType: target?.selection?.fleetType || null,
    label: target?.selection?.label || "Available transport",
  };
}

function isFleetBookable(fleet) {
  const status = String(fleet?.activeStatus || fleet?.status || "").trim().toLowerCase();
  return ["active", "available", "online"].includes(status);
}

function isFleetNearby(fleet) {
  const distance = Number(fleet?.distanceKm || 0);
  const maxDistance = Number(fleet?.maxDistanceKm || 0);
  if (!Number.isFinite(distance) || distance <= 0) return true;
  if (!Number.isFinite(maxDistance) || maxDistance <= 0) return true;
  return distance <= maxDistance;
}

function hasText(value) {
  return String(value || "").trim().length > 1;
}

function normalizeLocationPoint(place) {
  const lat = Number(place?.lat ?? place?.latitude);
  const lng = Number(place?.lng ?? place?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    ...place,
    lat,
    lng,
    address: place.address || place.fullAddress || place.detectedAddress || place.street || place.placeName || place.name || "",
    name: place.name || place.placeName || place.label || place.address || "Selected location",
    searchQuery: place.searchQuery || place.fullAddress || place.address || place.street || place.placeName || place.name || "",
  };
}

function getLocationInputValue(place) {
  return String(place?.address || place?.fullAddress || place?.detectedAddress || place?.street || place?.placeName || place?.name || "").trim();
}

function getBookingRequirementMessage(form, mode) {
  if (!hasText(form.pickup)) return "Add a pickup point before sending this booking.";
  if (!hasText(form.dropoff)) return "Add a drop-off point before sending this booking.";
  if (!hasText(form.passengerName)) return "Add the passenger or sender name.";
  if (!hasText(form.phone)) return "Add a phone number the operator can use.";
  if (form.pickupTime === "schedule" && !form.scheduledAt) return "Choose the scheduled pickup time.";
  if (form.bookingMethod === "time" && Number(form.bookedHours || 0) <= 0) return "Add the number of hours for this time booking.";
  if (mode === "delivery" && !hasText(form.packageDescription)) return "Add a package description for this delivery.";
  return "";
}

function getBookingPickerLabels(kind, bookingMode) {
  const isPickup = kind === "pickup";
  const destinationName = bookingMode === "delivery" ? "delivery drop-off" : "drop-off";
  const label = isPickup ? "pickup" : destinationName;

  return {
    historyKey: `transport-booking-${kind}-picker`,
    backLabel: "Back to booking form",
    eyebrow: "Transport booking",
    cardEyebrow: isPickup ? "Pickup point" : bookingMode === "delivery" ? "Delivery address" : "Drop-off point",
    headerCurrentTitle: `Confirm ${label} location`,
    headerDropTitle: `Drop ${label} pin`,
    currentHeading: `Your current ${label} location`,
    dropHeading: `Place the pin on the ${label} point`,
    dropInstruction: `Move the map until the pin sits exactly on the ${label} gate, door, junction, or landmark, then add the location.`,
    currentStatus: `Confirming your current ${label} location...`,
    dropStatus: `Move the map until the pin is exactly on the ${label} point.`,
    currentName: `Current ${label} location`,
    droppedName: `Pinned ${label} location`,
  };
}

export default function TransportBookingDrawer({ open, target, onClose, onCreated, onLocateArea }) {
  const initialSelection = useMemo(() => selectionFromTarget(target), [target]);
  const [selection, setSelection] = useState(initialSelection);
  const [availableFleets, setAvailableFleets] = useState([]);
  const [loadingFleets, setLoadingFleets] = useState(false);
  const [routeEstimate, setRouteEstimate] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeMessage, setRouteMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [searchCenter, setSearchCenter] = useState(null);
  const [areaPicker, setAreaPicker] = useState(null);
  const [showPassengerCaution, setShowPassengerCaution] = useState(false);
  const [dontShowPassengerCaution, setDontShowPassengerCaution] = useState(false);

  const [form, setForm] = useState({
    pickup: "",
    dropoff: "",
    pickupPoint: null,
    dropoffPoint: null,
    passengerName: "",
    phone: "",
    pickupTime: "now",
    scheduledAt: "",
    passengers: "1",
    packageDescription: "",
    note: "",
    bookingMethod: "distance",
    bookedHours: "1",
  });

  const activeAvailableFleets = useMemo(() => availableFleets.filter(isFleetBookable), [availableFleets]);
  const nearbyMatchingFleets = useMemo(() => availableFleets.filter(isFleetNearby), [availableFleets]);
  const nearbyActiveFleets = useMemo(() => nearbyMatchingFleets.filter(isFleetBookable), [nearbyMatchingFleets]);
  const selectedFleet = target?.fleet || null;
  const isDirectedBooking = Boolean(selectedFleet);
  const bookingTargetFleets = useMemo(
    () => (selectedFleet ? [selectedFleet] : nearbyMatchingFleets),
    [nearbyMatchingFleets, selectedFleet],
  );
  const bookingFleet = useMemo(() => {
    return selectedFleet || bookingTargetFleets[0] || activeAvailableFleets[0] || availableFleets[0] || null;
  }, [activeAvailableFleets, availableFleets, bookingTargetFleets, selectedFleet]);

  const displayFleet = bookingFleet;
  const bookingMode = modeForFleet(bookingFleet, selection.mode);
  const pricingInput = {
    bookingMethod: form.bookingMethod,
    distanceKm: routeEstimate?.distanceKm || 0,
    bookedHours: form.bookedHours,
  };
  const fareEstimate = describeFleetFare(displayFleet, pricingInput);
  const requirementMessage = getBookingRequirementMessage(form, bookingMode);
  const fleetMessage = !isDirectedBooking && loadingFleets
    ? "Checking nearby registered operators for this request."
    : !isDirectedBooking && !bookingTargetFleets.length
      ? "No nearby registered operator matches this service and fleet type right now."
      : "";
  const sendBlockMessage = requirementMessage || fleetMessage;
  const canSendBooking = !submitting && !routeLoading && !requirementMessage && bookingTargetFleets.length > 0;

  useEffect(() => {
    if (!open) return;

    const accepted = localStorage.getItem(PASSENGER_CAUTION_KEY) === "true";
    if (!accepted) {
      setShowPassengerCaution(true);
      setDontShowPassengerCaution(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const nextSelection = selectionFromTarget(target);
    const draftForm = target?.draftForm || null;
    setSelection(nextSelection);
    setStatus("");
    setRouteEstimate(null);
    setRouteMessage("");
    setAreaPicker(null);
    setForm((current) => ({
      ...current,
      ...(draftForm || {}),
      pickup: target?.pickup || target?.movement?.pickup || draftForm?.pickup || current.pickup,
      dropoff: target?.destination || target?.movement?.destination || draftForm?.dropoff || current.dropoff,
      pickupPoint: normalizeLocationPoint(target?.pickupPoint || target?.movement?.pickupPoint) || draftForm?.pickupPoint || current.pickupPoint,
      dropoffPoint: normalizeLocationPoint(target?.destinationPoint || target?.movement?.destinationPoint) || draftForm?.dropoffPoint || current.dropoffPoint,
      packageDescription: draftForm?.packageDescription || "",
      note: draftForm?.note || "",
    }));
  }, [open, target]);

  useEffect(() => {
    if (!open || !navigator.geolocation) return undefined;

    let alive = true;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!alive) return;
        setSearchCenter({
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
          label: "Current area",
        });
      },
      () => {
        if (alive) setSearchCenter(null);
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 6500 },
    );

    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open || form.bookingMethod !== "distance" || !hasText(form.pickup) || !hasText(form.dropoff)) return undefined;

    let alive = true;
    const timer = window.setTimeout(async () => {
      try {
        setRouteLoading(true);
        setRouteMessage("Calculating the route distance...");
        const nextRoute = await calculateBookingRoute(form.pickup, form.dropoff, {
          pickupPoint: form.pickupPoint,
          destinationPoint: form.dropoffPoint,
          center: searchCenter,
        });
        if (!alive) return;
        setRouteEstimate(nextRoute);
        setRouteMessage(`${formatBookingDistance(nextRoute.distanceKm)} route${nextRoute.approximate ? " - approximate road estimate" : ""}`);
      } catch (error) {
        if (!alive) return;
        setRouteEstimate(null);
        setRouteMessage(error.message || "Unable to calculate this route.");
      } finally {
        if (alive) setRouteLoading(false);
      }
    }, 650);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [
    form.bookingMethod,
    form.dropoff,
    form.dropoffPoint,
    form.pickup,
    form.pickupPoint,
    open,
    searchCenter,
  ]);

  useEffect(() => {
    if (!open) return undefined;

    if (target?.fleet) {
      setAvailableFleets([target.fleet]);
      setLoadingFleets(false);
      return undefined;
    }

    let alive = true;
    setLoadingFleets(true);

    fetchTransportFleets({
      mode: selection.mode,
      fleetType: selection.fleetType || null,
    })
      .then((fleets) => {
        if (!alive) return;

        setAvailableFleets(fleets);
      })
      .catch((error) => {
        if (alive) {
          setAvailableFleets([]);
          setStatus(error.message || "Unable to load available operators.");
        }
      })
      .finally(() => {
        if (alive) setLoadingFleets(false);
      });

    return () => {
      alive = false;
    };
  }, [open, selection, target]);

  if (!open) return null;

  function updateForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function updateSelection(patch) {
    setSelection((current) => ({ ...current, ...patch }));
  }

  function acceptPassengerCaution() {
    if (dontShowPassengerCaution) {
      localStorage.setItem(PASSENGER_CAUTION_KEY, "true");
    }
    setShowPassengerCaution(false);
  }

  function openBookingLocationPicker(kind, start = "current") {
    setAreaPicker({ kind, start });
    setStatus("");
  }

  function acceptBookingLocation(location) {
    const nextLocation = normalizeAreaLocation(location, areaPicker?.kind === "pickup" ? form.pickup : form.dropoff);
    const nextPoint = normalizeLocationPoint(nextLocation);
    if (!nextPoint) return;

    if (areaPicker?.kind === "pickup") {
      updateForm({
        pickup: getLocationInputValue(nextPoint),
        pickupPoint: nextPoint,
      });
      setStatus(`Pickup location added: ${nextPoint.address}`);
    } else {
      updateForm({
        dropoff: getLocationInputValue(nextPoint),
        dropoffPoint: nextPoint,
      });
      setStatus(`Drop-off location added: ${nextPoint.address}`);
    }
    setAreaPicker(null);
  }

  function buildBookingAreaDestination(kind) {
    const pickupText = form.pickup.trim();
    const dropoffText = form.dropoff.trim();
    const areaText = kind === "pickup" ? pickupText : dropoffText || pickupText;
    const areaPoint = kind === "pickup" ? form.pickupPoint : form.dropoffPoint;

    if (!areaText) return null;

    return {
      id: `booking-${kind}-${Date.now()}`,
      type: "transport-booking",
      name: areaPoint?.name || areaText,
      label: areaPoint?.label || areaPoint?.name || areaText,
      address: areaPoint?.address || areaText,
      category: kind === "pickup" ? "Pickup" : "Destination",
      status: "community",
      description:
        kind === "pickup"
          ? "Passenger pickup area from transport booking."
          : `Transport route from ${pickupText || "current location"} to ${dropoffText || areaText}.`,
      searchQuery: areaText,
      pickup: pickupText,
      destination: dropoffText,
      ...(areaPoint ? { lat: areaPoint.lat, lng: areaPoint.lng, country: areaPoint.country, countryCode: areaPoint.countryCode } : {}),
      fleetId: null,
    };
  }

  function handleLocateArea(kind) {
    const destination = buildBookingAreaDestination(kind);

    if (!destination) {
      setStatus(kind === "pickup" ? "Add a pickup point before locating it." : "Add a drop-off point before routing.");
      return;
    }

    onLocateArea?.(destination, {
      autoRoute: true,
      returnTo: "booking",
      bookingTarget: {
        ...target,
        selection,
        fleet: selectedFleet,
        draftForm: form,
      },
    });
  }

  async function sendBooking() {
    setStatus("");

    const nextRequirementMessage = getBookingRequirementMessage(form, bookingMode);
    if (nextRequirementMessage) {
      setStatus(nextRequirementMessage);
      return;
    }

    try {
      setSubmitting(true);
      let resolvedRoute = routeEstimate;
      if (form.bookingMethod === "distance" && !resolvedRoute) {
        setRouteLoading(true);
        resolvedRoute = await calculateBookingRoute(form.pickup, form.dropoff, {
          pickupPoint: form.pickupPoint,
          destinationPoint: form.dropoffPoint,
          center: searchCenter,
        });
        setRouteEstimate(resolvedRoute);
        setRouteMessage(`${formatBookingDistance(resolvedRoute.distanceKm)} route${resolvedRoute.approximate ? " - approximate road estimate" : ""}`);
      }

      if (!bookingTargetFleets.length) {
        throw new Error("No nearby matching operators are available for this booking right now.");
      }

      const nextBookingMode = modeForFleet(bookingFleet || null, selection.mode);
      const booking = await createTransportBooking({
        ...form,
        fleet: bookingFleet || null,
        fleetId: null,
        targetFleets: bookingTargetFleets,
        mode: nextBookingMode,
        pickup: form.pickup,
        dropoff: form.dropoff,
        bookingMethod: form.bookingMethod,
        bookedHours: form.bookingMethod === "time" ? Number(form.bookedHours) : null,
        distanceKm: resolvedRoute?.distanceKm || null,
        pickupPoint: resolvedRoute?.pickupPoint || form.pickupPoint || null,
        destinationPoint: resolvedRoute?.destinationPoint || form.dropoffPoint || null,
      });

      setStatus(
        isDirectedBooking
          ? `Booking sent directly to ${selectedFleet?.operatorName || selectedFleet?.fleetName || "the selected operator"}.`
          : booking?.notifiedFleetCount > 1
          ? `Booking sent to ${booking.notifiedFleetCount} nearby matching operators. Any available operator can contact you and respond.`
          : "Booking sent. The operator will see this as a pending passenger request and can contact you.",
      );

      onCreated?.(booking);
    } catch (error) {
      setStatus(error.message || "Unable to send this booking.");
    } finally {
      setSubmitting(false);
      setRouteLoading(false);
    }
  }

  return (
    <AppPortal>
      <div className="fixed inset-0 z-[1200] flex justify-end">
        <button
          type="button"
          aria-label="Close booking overlay"
          onClick={onClose}
          className="kt-backdrop absolute inset-0"
        />

        <aside className="kt-panel-enter relative flex h-full w-full max-w-2xl flex-col bg-gray-50 shadow-2xl">
          <header className="kt-header-glass flex items-center justify-between px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">
                Transport booking
              </p>
              <h2 className="mt-1 truncate text-xl font-black text-gray-950">
                {bookingMode === "delivery" ? "Send delivery" : "Book a ride"}
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="kt-touchable flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              aria-label="Close booking"
            >
              <FiX size={20} />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            {status ? (
              <p
                className={`mb-4 rounded-xl p-3 text-sm font-bold ${
                  status.startsWith("Booking sent") ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                }`}
              >
                {status}
              </p>
            ) : null}

            <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Choose booking method</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <BookingMethodButton
                  active={form.bookingMethod === "distance"}
                  icon={FiNavigation}
                  title="Book by distance"
                  detail="Route price is calculated from pickup to drop-off using the operator's price per kilometer."
                  onClick={() => updateForm({ bookingMethod: "distance" })}
                />
                <BookingMethodButton
                  active={form.bookingMethod === "time"}
                  icon={FiClock}
                  title="Book by time"
                  detail="Reserve the operator by the hour and see the total from the operator's hourly price."
                  onClick={() => updateForm({ bookingMethod: "time" })}
                />
              </div>
            </section>

            <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              {!isDirectedBooking ? <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-black uppercase text-gray-500">Service</span>
                  <select
                    value={selection.mode}
                    onChange={(event) => updateSelection({ mode: event.target.value })}
                    className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
                  >
                    <option value="topRated">Any service</option>
                    <option value="ride">Ride</option>
                    <option value="delivery">Delivery</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-black uppercase text-gray-500">Fleet type</span>
                  <select
                    value={selection.fleetType || ""}
                    onChange={(event) => updateSelection({ fleetType: event.target.value || null })}
                    className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
                  >
                    {fleetTypes.map((type) => (
                      <option key={type.value || "all"} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </label>
              </div> : null}

              {isDirectedBooking ? (
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-blue-700">Direct booking</p>
                  <p className="mt-1 text-lg font-black text-blue-950">
                    {selectedFleet?.operatorName || selectedFleet?.fleetName || "Selected operator"}
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-blue-800">
                    This request is attached to this operator only. It will not be offered to other nearby operators.
                  </p>
                  <p className="mt-2 text-xs font-black text-blue-700">
                    {[selectedFleet?.operatorId, selectedFleet?.displayType || selectedFleet?.fleetType, selectedFleet?.plateNumber]
                      .filter(Boolean)
                      .join(" - ")}
                  </p>
                </div>
              ) : <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                <p className="text-sm font-black text-emerald-950">Open request</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-emerald-800">
                  No operator is attached to this booking yet. When you save it, it enters My Trips and notifies every nearby registered operator matching the service and fleet type you selected.
                </p>
                <p className="mt-2 text-xs font-black text-emerald-700">
                  {loadingFleets
                    ? "Checking matching operators..."
                    : `${bookingTargetFleets.length} nearby matching operator${bookingTargetFleets.length === 1 ? "" : "s"} ready for notification (${nearbyActiveFleets.length} active now).`}
                </p>
              </div>}

              {displayFleet ? (
                <div className="mt-4 grid gap-2 rounded-xl bg-gray-50 p-3 text-sm font-semibold text-gray-600 sm:grid-cols-2">
                  <InfoLine
                    icon={FiTruck}
                    label="Request"
                    value={isDirectedBooking
                      ? `Only ${selectedFleet?.operatorName || selectedFleet?.fleetName || "the selected operator"} will be notified`
                      : `${bookingTargetFleets.length} nearby matching operator${bookingTargetFleets.length === 1 ? "" : "s"} will be notified`}
                  />
                  <InfoLine icon={FiNavigation} label="Location" value={displayFleet.currentLocation || displayFleet.lastKnownLocation} />
                  <InfoLine
                    icon={FiClock}
                    label="Operator status"
                    value={
                      isFleetBookable(displayFleet)
                        ? isDirectedBooking ? "Selected operator is active now" : "At least one matching fleet is active now"
                        : `${displayFleet.lastActive || "Offline"}; request will remain in this operator's alerts`
                    }
                  />
                  <InfoLine icon={FiCreditCard} label="Fare" value={fareEstimate} />
                </div>
              ) : null}
            </section>

            <section className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700">
                  <FiCreditCard size={19} />
                </span>
                <div>
                  <p className="text-sm font-black text-emerald-950">Calculated fare</p>
                  <p className="mt-1 text-sm font-black text-emerald-700">{fareEstimate}</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-emerald-800">
                    {form.bookingMethod === "distance"
                      ? `Nearby matching operators will see your resolved route${routeEstimate ? ` of ${formatBookingDistance(routeEstimate.distanceKm)}` : ""} before responding.`
                      : `Nearby matching operators will see your requested ${Number(form.bookedHours || 0)} hour${Number(form.bookedHours || 0) === 1 ? "" : "s"} before responding.`}
                  </p>
                </div>
              </div>
            </section>

            <section className="mt-4 grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <AddressSuggestionInput
                  icon={FiMapPin}
                  label="Pickup point"
                  value={form.pickup}
                  selectedPoint={form.pickupPoint}
                  center={searchCenter || form.dropoffPoint}
                  onChange={(value) => updateForm({ pickup: value, pickupPoint: null })}
                  onSelect={(place) => updateForm({
                    pickup: getLocationInputValue(place),
                    pickupPoint: normalizeLocationPoint(place),
                  })}
                  onLocateMe={() => openBookingLocationPicker("pickup", "current")}
                  onDropPin={() => openBookingLocationPicker("pickup", "dropPin")}
                  placeholder="Street, junction, saved place, or landmark"
                />

                <AddressSuggestionInput
                  icon={FiNavigation}
                  label={bookingMode === "delivery" ? "Delivery drop-off point" : "Drop-off point"}
                  value={form.dropoff}
                  selectedPoint={form.dropoffPoint}
                  center={form.pickupPoint || searchCenter}
                  onChange={(value) => updateForm({ dropoff: value, dropoffPoint: null })}
                  onSelect={(place) => updateForm({
                    dropoff: getLocationInputValue(place),
                    dropoffPoint: normalizeLocationPoint(place),
                  })}
                  onLocateMe={() => openBookingLocationPicker("dropoff", "current")}
                  onDropPin={() => openBookingLocationPicker("dropoff", "dropPin")}
                  placeholder="Destination, address, station, or landmark"
                />

                <FormInput
                  icon={FiUser}
                  label="Passenger / sender name"
                  value={form.passengerName}
                  onChange={(value) => updateForm({ passengerName: value })}
                  placeholder="Name operator should see"
                />

                <FormInput
                  icon={FiPhone}
                  label="Phone"
                  value={form.phone}
                  onChange={(value) => updateForm({ phone: value })}
                  placeholder={getCountryPhonePlaceholder()}
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <LocateAreaButton
                  icon={FiMapPin}
                  label="Locate pickup"
                  detail="Open pickup in Area View"
                  disabled={!hasText(form.pickup)}
                  onClick={() => handleLocateArea("pickup")}
                />
                <LocateAreaButton
                  icon={FiNavigation}
                  label="Route drop-off"
                  detail="Open smart Area View route"
                  disabled={!hasText(form.dropoff)}
                  onClick={() => handleLocateArea("dropoff")}
                  primary
                />
              </div>

              {form.bookingMethod === "distance" ? (
                <div className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-sm font-bold ${
                  routeEstimate ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"
                }`}>
                  <FiRefreshCw className={routeLoading ? "animate-spin" : ""} size={17} />
                  <span>{routeMessage || "Add pickup and drop-off locations to calculate each operator's distance price."}</span>
                </div>
              ) : (
                <label className="space-y-1">
                  <span className="text-xs font-black uppercase text-gray-500">Number of hours</span>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={form.bookedHours}
                    onChange={(event) => updateForm({ bookedHours: event.target.value })}
                    className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
                  />
                </label>
              )}

              <div className="grid gap-3 md:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-xs font-black uppercase text-gray-500">Pickup time</span>
                  <select
                    value={form.pickupTime}
                    onChange={(event) => updateForm({ pickupTime: event.target.value })}
                    className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
                  >
                    <option value="now">Now</option>
                    <option value="schedule">Schedule</option>
                  </select>
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-black uppercase text-gray-500">Scheduled time</span>
                  <input
                    type="datetime-local"
                    value={form.scheduledAt}
                    onChange={(event) => updateForm({ scheduledAt: event.target.value })}
                    disabled={form.pickupTime !== "schedule"}
                    className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-950 outline-none focus:border-emerald-500 disabled:text-gray-400"
                  />
                </label>
              </div>

              {bookingMode === "delivery" ? (
                <FormInput
                  icon={FiBox}
                  label="Package description"
                  value={form.packageDescription}
                  onChange={(value) => updateForm({ packageDescription: value })}
                  placeholder="Small bag, box, food parcel, documents..."
                />
              ) : (
                <label className="space-y-1">
                  <span className="text-xs font-black uppercase text-gray-500">Passengers</span>
                  <select
                    value={form.passengers}
                    onChange={(event) => updateForm({ passengers: event.target.value })}
                    className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
                  >
                    <option value="1">1 passenger</option>
                    <option value="2">2 passengers</option>
                    <option value="3">3 passengers</option>
                    <option value="4">4 passengers</option>
                  </select>
                </label>
              )}

              <label className="space-y-1">
                <span className="text-xs font-black uppercase text-gray-500">Trip note</span>
                <textarea
                  value={form.note}
                  onChange={(event) => updateForm({ note: event.target.value })}
                  rows={4}
                  placeholder="Gate color, route instruction, package handling, passenger note..."
                  className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-500"
                />
              </label>
            </section>

            <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <FiAlertTriangle className="mt-0.5 shrink-0 text-amber-700" size={20} />
                <div>
                  <p className="text-sm font-black text-amber-900">Payment notice</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-amber-800">
                    Built-in transport payments are not active yet. Confirm the fare, route, operator identity,
                    and payment method before paying. Do not share PINs, OTPs, or account passwords.
                  </p>
                </div>
              </div>
            </section>
          </div>

          <footer className="border-t border-gray-100 bg-white px-4 py-3 sm:px-5">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
              <p className={`text-xs font-semibold leading-5 ${sendBlockMessage ? "text-gray-500" : "text-emerald-700"}`}>
                {requirementMessage || fleetMessage || (isDirectedBooking
                  ? `Ready to send this ${bookingMode} request directly to ${selectedFleet?.operatorName || selectedFleet?.fleetName || "the selected operator"}.`
                  : `Ready to save this ${bookingMode} request in My Trips and notify matching operators.`)}
              </p>

              <button
                type="button"
                onClick={sendBooking}
                disabled={!canSendBooking}
                className={`kt-touchable inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-black transition ${
                  canSendBooking
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {submitting ? <FiClock size={17} /> : <FiSend size={17} />}
                {submitting ? "Saving..." : "Save & notify"}
              </button>
            </div>
          </footer>
        </aside>

        {showPassengerCaution ? (
          <div className="fixed inset-0 z-[1400] flex items-end justify-center bg-slate-950/45 px-4 py-5 backdrop-blur-sm sm:items-center">
            <section className="w-full max-w-lg rounded-[2rem] bg-white p-5 shadow-2xl">
              <div className="flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <FiAlertTriangle size={24} />
                </span>

                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
                    Passenger safety notice
                  </p>
                  <h2 className="mt-1 text-xl font-black text-slate-950">
                    Before you book with KunThai Transport
                  </h2>
                </div>
              </div>

              <div className="mt-5 grid max-h-[48vh] gap-3 overflow-y-auto pr-1 text-sm font-semibold leading-6 text-slate-600">
                <p>
                  KunThai helps passengers connect with registered operators, view routes,
                  create booking records, and report transport issues.
                </p>

                <p>
                  We may use and share necessary booking details, passenger information,
                  operator information, route history, contact details, payment records,
                  or safety reports when required for fraud prevention, dispute review,
                  emergency support, legal compliance, or verified government request.
                </p>

                <p>
                  KunThai is a technology platform. We can guide, record, notify, and
                  provide information, but we cannot physically guarantee your safety,
                  prevent accidents, stop crime, replace emergency services, or control
                  operator behavior in the real world.
                </p>

                <p>
                  Always confirm the operator, fleet, route, fare, and payment method
                  before moving. Do not share OTPs, PINs, passwords, or private financial
                  details with anyone.
                </p>
              </div>

              <label className="mt-5 flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <input
                  type="checkbox"
                  checked={dontShowPassengerCaution}
                  onChange={(event) => setDontShowPassengerCaution(event.target.checked)}
                  className="mt-1 h-5 w-5 accent-emerald-600"
                />
                <span className="text-sm font-bold leading-6 text-slate-700">
                  Do not show this again
                </span>
              </label>

              <button
                type="button"
                onClick={acceptPassengerCaution}
                className="mt-5 h-12 w-full rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700"
              >
                I Have Read and Accepted the Condition
              </button>
            </section>
          </div>
        ) : null}

        {areaPicker ? (
          <div className="fixed inset-0 z-[1200] bg-slate-950">
            <NearbyAreaScreen
              mode="businessLocationPicker"
              pickerStart={areaPicker.start}
              pickerLabels={getBookingPickerLabels(areaPicker.kind, bookingMode)}
              backLabel="Back to booking form"
              onBack={() => setAreaPicker(null)}
              onLocationPicked={acceptBookingLocation}
            />
          </div>
        ) : null}
      </div>
    </AppPortal>
  );
}

function LocateAreaButton({ icon, label, detail, disabled, onClick, primary = false }) {
  const enabledClass = primary
    ? "border-emerald-200 bg-slate-950 text-white shadow-sm shadow-slate-200/70 hover:bg-slate-900"
    : "border-emerald-100 bg-emerald-50 text-emerald-800 hover:border-emerald-200 hover:bg-emerald-100";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`kt-touchable flex min-h-14 items-center gap-3 rounded-2xl border px-3 py-2 text-left transition ${
        disabled ? "border-gray-200 bg-gray-100 text-gray-400" : enabledClass
      }`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${primary && !disabled ? "bg-white/10" : "bg-white"}`}>
        {createElement(icon, { size: 18 })}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-black">{label}</span>
        <span className={`block truncate text-xs font-bold ${primary && !disabled ? "text-white/70" : "text-current opacity-70"}`}>
          {detail}
        </span>
      </span>
    </button>
  );
}

function BookingMethodButton({ active, icon, title, detail, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`kt-touchable rounded-2xl border p-3 text-left ${
        active
          ? "border-emerald-300 bg-emerald-50 text-emerald-950 shadow-sm"
          : "border-slate-200 bg-slate-50 text-slate-700 hover:border-emerald-200 hover:bg-white"
      }`}
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? "bg-emerald-600 text-white" : "bg-white text-emerald-700"}`}>
        {createElement(icon, { size: 18 })}
      </span>
      <span className="mt-3 block text-sm font-black">{title}</span>
      <span className="mt-1 block text-xs font-semibold leading-5 opacity-75">{detail}</span>
    </button>
  );
}

function InfoLine({ icon, label, value }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {createElement(icon, { size: 15, className: "shrink-0 text-gray-500" })}
      <span className="min-w-0">
        <span className="mr-1 text-xs font-black uppercase text-gray-400">{label}:</span>
        <span className="break-words">{value || "Pending"}</span>
      </span>
    </div>
  );
}

function AddressSuggestionInput({ icon, label, value, selectedPoint, center, onChange, onSelect, onLocateMe, onDropPin, placeholder }) {
  const [focused, setFocused] = useState(false);
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const validation = useAddressAreaValidation(value, { center, selectedPoint });

  useEffect(() => {
    if (!focused) return undefined;

    const text = String(value || "").trim();
    if (text.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return undefined;
    }

    let alive = true;
    const timer = window.setTimeout(async () => {
      try {
        setSearching(true);
        const results = await searchLocations(text, center, { limit: 6 });
        if (alive) setSuggestions(results || []);
      } catch {
        if (alive) setSuggestions([]);
      } finally {
        if (alive) setSearching(false);
      }
    }, 320);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [center, focused, value]);

  const showSuggestions = focused && (searching || suggestions.length > 0 || String(value || "").trim().length >= 2);

  return (
    <label className="min-w-0 space-y-1">
      <span className="inline-flex items-center gap-2 text-xs font-black uppercase text-gray-500">
        {label}
        <AddressAreaStatusIcon status={validation.status} />
      </span>
      <span className="relative block min-w-0">
        {createElement(icon, {
          size: 17,
          className: "absolute left-3 top-1/2 -translate-y-1/2 text-gray-400",
        })}
        <input
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 140)}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-12 w-full min-w-0 rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-9 text-sm font-semibold outline-none focus:border-emerald-500"
        />
        <AddressAreaStatusIcon status={validation.status} className="absolute right-3 top-1/2 -translate-y-1/2" />
      </span>

      {selectedPoint?.lat && selectedPoint?.lng ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
          Selected address matched nearby coordinates{selectedPoint.country ? ` in ${selectedPoint.country}` : ""}.
        </p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onLocateMe}
          className="kt-touchable inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-black text-white hover:bg-slate-800"
        >
          <FiNavigation size={15} />
          Locate me
        </button>
        <button
          type="button"
          onClick={onDropPin}
          className="kt-touchable inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-black text-gray-700 hover:bg-gray-50"
        >
          <FiMapPin size={15} />
          Drop a pin
        </button>
      </div>

      <AddressAreaResolutionCard
        validation={validation}
        onLocateMe={onLocateMe}
        onDropPin={onDropPin}
      />

      {showSuggestions ? (
        <div className="max-h-56 overflow-y-auto rounded-2xl border border-gray-100 bg-white p-1 shadow-sm">
          {searching ? (
            <p className="px-3 py-3 text-xs font-black uppercase tracking-wide text-gray-400">Searching nearby addresses...</p>
          ) : suggestions.length ? (
            suggestions.map((place) => (
              <button
                key={place.id}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(place);
                  setFocused(false);
                  setSuggestions([]);
                }}
                className="flex w-full min-w-0 gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-emerald-50"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                  {createElement(icon, { size: 16 })}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-black text-slate-950">{place.name}</span>
                  <span className="mt-0.5 block break-words text-xs font-bold leading-5 text-slate-500">
                    {[place.distance, place.address || place.fullAddress, place.country].filter(Boolean).join(" - ")}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className="px-3 py-3 text-xs font-bold leading-5 text-gray-500">
              No nearby match yet. Add a clearer street, junction, landmark, or select from Area View.
            </p>
          )}
        </div>
      ) : null}
    </label>
  );
}

function FormInput({ icon, label, value, onChange, placeholder }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-black uppercase text-gray-500">{label}</span>
      <span className="relative block">
        {createElement(icon, {
          size: 17,
          className: "absolute left-3 top-1/2 -translate-y-1/2 text-gray-400",
        })}
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3 text-sm font-semibold outline-none focus:border-emerald-500"
        />
      </span>
    </label>
  );
}
