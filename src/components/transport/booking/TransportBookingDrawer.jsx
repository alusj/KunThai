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
import { createTransportBooking } from "../../services/bookingService";
import { getTransportSavedPlaces } from "../../services/passengerTransportService";
import { fetchTransportFleets } from "../../services/transportFleetService";
import {
  calculateBookingRoute,
  calculateFleetFare,
  describeFleetFare,
  formatBookingDistance,
} from "../../services/transportPricingService";

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

function getPlaceLabel(place) {
  return place.category === "Other" ? place.customCategory || "Other" : place.category || "Saved";
}

function isFleetBookable(fleet) {
  const status = String(fleet?.activeStatus || fleet?.status || "").trim().toLowerCase();
  return ["active", "available", "online"].includes(status);
}

function hasText(value) {
  return String(value || "").trim().length > 1;
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

export default function TransportBookingDrawer({ open, target, onClose, onCreated, onLocateArea }) {
  const initialSelection = useMemo(() => selectionFromTarget(target), [target]);
  const [selection, setSelection] = useState(initialSelection);
  const [availableFleets, setAvailableFleets] = useState([]);
  const [selectedFleetId, setSelectedFleetId] = useState(target?.fleet?.id || "");
  const [savedPlaces, setSavedPlaces] = useState([]);
  const [loadingFleets, setLoadingFleets] = useState(false);
  const [routeEstimate, setRouteEstimate] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeMessage, setRouteMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({
    pickup: "",
    dropoff: "",
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

  const selectedFleet = useMemo(
    () => availableFleets.find((fleet) => String(fleet.id) === String(selectedFleetId)) || target?.fleet || null,
    [availableFleets, selectedFleetId, target],
  );
  const requiresLiveOperator = false;
  const activeAvailableFleets = useMemo(() => availableFleets.filter(isFleetBookable), [availableFleets]);
  const isSelectedFleetActive = isFleetBookable(selectedFleet);
  const bookingFleet = useMemo(() => {
    if (!requiresLiveOperator) {
      if (selectedFleetId && selectedFleet) return selectedFleet;
      return selectedFleet || availableFleets[0] || null;
    }

    if (isSelectedFleetActive) return selectedFleet;
    if (selectedFleetId && selectedFleet) return null;
    return activeAvailableFleets[0] || null;
  }, [activeAvailableFleets, availableFleets, isSelectedFleetActive, requiresLiveOperator, selectedFleet, selectedFleetId]);
  const displayFleet = bookingFleet || selectedFleet;
  const bookingMode = modeForFleet(bookingFleet || selectedFleet, selection.mode);
  const pricingInput = {
    bookingMethod: form.bookingMethod,
    distanceKm: routeEstimate?.distanceKm || 0,
    bookedHours: form.bookedHours,
  };
  const fareEstimate = describeFleetFare(displayFleet, pricingInput);
  const requirementMessage = getBookingRequirementMessage(form, bookingMode);
  const fleetMessage = loadingFleets
    ? requiresLiveOperator
      ? "Checking active operators for this booking."
      : "Checking matching operators for this scheduled booking."
    : !bookingFleet
      ? selectedFleet
        ? requiresLiveOperator
          ? "The selected operator is not active right now. Choose another active operator."
          : "Choose another operator for this scheduled booking."
        : requiresLiveOperator
          ? "No active operator matches this service and fleet type right now."
          : "No operator matches this service and fleet type."
      : "";
  const sendBlockMessage = requirementMessage || fleetMessage;
  const canSendBooking = !submitting && !routeLoading && !requirementMessage && Boolean(bookingFleet);

  useEffect(() => {
    if (!open) return;

    const nextSelection = selectionFromTarget(target);
    setSelection(nextSelection);
    setSelectedFleetId(target?.fleet?.id || "");
    setSavedPlaces(getTransportSavedPlaces());
    setStatus("");
    setRouteEstimate(null);
    setRouteMessage("");
    setForm((current) => ({
      ...current,
      pickup: target?.pickup || target?.movement?.pickup || current.pickup,
      dropoff: target?.destination || target?.movement?.destination || current.dropoff,
      packageDescription: "",
      note: "",
    }));
  }, [open, target]);

  useEffect(() => {
    if (!open || form.bookingMethod !== "distance" || !hasText(form.pickup) || !hasText(form.dropoff)) return undefined;

    let alive = true;
    const timer = window.setTimeout(async () => {
      try {
        setRouteLoading(true);
        setRouteMessage("Calculating the route distance...");
        const nextRoute = await calculateBookingRoute(form.pickup, form.dropoff);
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
  }, [form.bookingMethod, form.dropoff, form.pickup, open]);

  useEffect(() => {
    if (!open) return undefined;

    let alive = true;
    setLoadingFleets(true);

    fetchTransportFleets({
      mode: selection.mode,
      fleetType: selection.fleetType || null,
    })
      .then((fleets) => {
        if (!alive) return;

        const nextFleets = target?.fleet
          ? [target.fleet, ...fleets.filter((fleet) => fleet.id !== target.fleet.id)]
          : fleets;

        setAvailableFleets(nextFleets);
        setSelectedFleetId((current) => current || nextFleets[0]?.id || "");
      })
      .catch((error) => {
        if (alive) {
          setAvailableFleets(target?.fleet ? [target.fleet] : []);
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
    setSelectedFleetId("");
  }

  function buildBookingAreaDestination(kind) {
    const pickupText = form.pickup.trim();
    const dropoffText = form.dropoff.trim();
    const areaText = kind === "pickup" ? pickupText : dropoffText || pickupText;

    if (!areaText) return null;

    return {
      id: `booking-${kind}-${Date.now()}`,
      type: "transport-booking",
      name: areaText,
      label: areaText,
      address: areaText,
      category: kind === "pickup" ? "Pickup" : "Destination",
      status: "community",
      description:
        kind === "pickup"
          ? "Passenger pickup area from transport booking."
          : `Transport route from ${pickupText || "current location"} to ${dropoffText || areaText}.`,
      searchQuery: areaText,
      pickup: pickupText,
      destination: dropoffText,
      fleetId: bookingFleet?.id || selectedFleet?.id || null,
    };
  }

  function handleLocateArea(kind) {
    const destination = buildBookingAreaDestination(kind);

    if (!destination) {
      setStatus(kind === "pickup" ? "Add a pickup point before locating it." : "Add a drop-off point before routing.");
      return;
    }

    onLocateArea?.(destination, { autoRoute: true });
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
        resolvedRoute = await calculateBookingRoute(form.pickup, form.dropoff);
        setRouteEstimate(resolvedRoute);
        setRouteMessage(`${formatBookingDistance(resolvedRoute.distanceKm)} route${resolvedRoute.approximate ? " - approximate road estimate" : ""}`);
      }
      const resolvedFare = calculateFleetFare(bookingFleet, {
        bookingMethod: form.bookingMethod,
        distanceKm: resolvedRoute?.distanceKm,
        bookedHours: form.bookedHours,
      });
      if (!bookingFleet) throw new Error("Choose an operator before sending this booking.");
      if (!resolvedFare?.ready) {
        throw new Error(form.bookingMethod === "time"
          ? "This operator has not added an hourly rate yet. Choose another operator."
          : "This operator has not added a price per kilometer yet. Choose another operator.");
      }
      const nextBookingMode = modeForFleet(bookingFleet || null, selection.mode);
      const booking = await createTransportBooking({
        ...form,
        fleet: bookingFleet || null,
        fleetId: bookingFleet?.id || null,
        mode: nextBookingMode,
        pickup: form.pickup,
        dropoff: form.dropoff,
        bookingMethod: form.bookingMethod,
        bookedHours: form.bookingMethod === "time" ? Number(form.bookedHours) : null,
        distanceKm: resolvedRoute?.distanceKm || null,
        pickupPoint: resolvedRoute?.pickupPoint || null,
        destinationPoint: resolvedRoute?.destinationPoint || null,
      });
      setSelectedFleetId(bookingFleet?.id || "");
      setStatus("Booking sent. The operator will see this as a pending passenger request.");
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
            <div className="grid gap-3 md:grid-cols-3">
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

              <label className="space-y-1">
                <span className="text-xs font-black uppercase text-gray-500">Operator</span>
                <select
                  value={selectedFleetId}
                  onChange={(event) => setSelectedFleetId(event.target.value)}
                  className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
                >
                  <option value="">
                    {loadingFleets
                      ? "Loading operators..."
                      : requiresLiveOperator
                        ? activeAvailableFleets.length
                          ? "Auto-match best active operator"
                          : "No active operator available"
                        : availableFleets.length
                          ? "Auto-match best matching operator"
                          : "No operator available"}
                  </option>
                  {availableFleets.map((fleet) => (
                    <option key={fleet.id} value={fleet.id}>
                      {fleet.fleetName} - {describeFleetFare(fleet, pricingInput)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {displayFleet ? (
              <div className="mt-4 grid gap-2 rounded-xl bg-gray-50 p-3 text-sm font-semibold text-gray-600 sm:grid-cols-2">
                <InfoLine icon={FiTruck} label={bookingFleet && !selectedFleetId ? "Auto-match" : "Fleet"} value={`${displayFleet.fleetName} (${displayFleet.plateNumber})`} />
                <InfoLine icon={FiNavigation} label="Location" value={displayFleet.currentLocation || displayFleet.lastKnownLocation} />
                <InfoLine
                  icon={FiClock}
                  label={requiresLiveOperator ? "Status" : "Schedule"}
                  value={
                    requiresLiveOperator
                      ? isFleetBookable(displayFleet)
                        ? "Active now"
                        : displayFleet.lastActive || "Offline"
                      : isFleetBookable(displayFleet)
                        ? "Active now; scheduled request allowed"
                        : `${displayFleet.lastActive || "Offline"}; scheduled request allowed`
                  }
                />
                <InfoLine icon={FiCreditCard} label="Fare" value={fareEstimate} />
                <InfoLine
                  icon={form.bookingMethod === "time" ? FiClock : FiNavigation}
                  label={form.bookingMethod === "time" ? "Hourly rate" : "Distance rate"}
                  value={form.bookingMethod === "time"
                    ? `${describeFleetFare({ ...displayFleet, baseFare: 0 }, { bookingMethod: "time" })}`
                    : `${describeFleetFare({ ...displayFleet, baseFare: 0 }, { bookingMethod: "distance" })}`}
                />
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
                    ? `The selected operator's kilometer rate is calculated against ${routeEstimate ? formatBookingDistance(routeEstimate.distanceKm) : "your resolved route"}.`
                    : `The selected operator's hourly rate is calculated against ${Number(form.bookedHours || 0)} hour${Number(form.bookedHours || 0) === 1 ? "" : "s"}.`}
                </p>
              </div>
            </div>
          </section>

          {savedPlaces.length ? (
            <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-black text-gray-950">Saved pickup places</p>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {savedPlaces.map((place) => (
                  <button
                    key={place.id}
                    type="button"
                    onClick={() => updateForm({ pickup: place.street || place.detectedAddress || place.placeName })}
                    className="kt-touchable shrink-0 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-bold text-gray-600 hover:border-emerald-200 hover:bg-emerald-50"
                  >
                    <span className="block text-gray-950">{getPlaceLabel(place)}</span>
                    <span className="mt-0.5 block max-w-[180px] truncate">{place.street || place.detectedAddress}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-4 grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <FormInput
                icon={FiMapPin}
                label="Pickup point"
                value={form.pickup}
                onChange={(value) => updateForm({ pickup: value })}
                placeholder="Street, junction, saved place, or landmark"
              />
              <FormInput
                icon={FiNavigation}
                label={bookingMode === "delivery" ? "Delivery drop-off point" : "Drop-off point"}
                value={form.dropoff}
                onChange={(value) => updateForm({ dropoff: value })}
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
                placeholder="+232..."
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
              {requirementMessage || fleetMessage || `Ready to send a pending ${bookingMode} request.`}
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
              {submitting ? "Sending..." : "Send Booking"}
            </button>
          </div>
        </footer>
      </aside>
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
