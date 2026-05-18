import { createElement, useEffect, useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiBox,
  FiClock,
  FiCreditCard,
  FiMapPin,
  FiNavigation,
  FiPhone,
  FiSend,
  FiTruck,
  FiUser,
  FiX,
} from "react-icons/fi";

import AppPortal from "../../shared/AppPortal";
import { createTransportBooking } from "../../services/bookingService";
import { getTransportSavedPlaces } from "../../services/passengerTransportService";
import { fetchTransportFleets } from "../../services/transportFleetService";

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

function estimateFare(fleet, mode) {
  if (!fleet) return "Choose an operator";
  if (fleet.priceHint && !/confirmed on booking/i.test(fleet.priceHint)) return fleet.priceHint;

  const distance = Math.max(1, Number(fleet.distanceKm || 2));
  const type = fleet.fleetType;
  const base =
    mode === "delivery"
      ? type === "Car"
        ? 45
        : type === "Tricycle"
          ? 32
          : 22
      : type === "Car"
        ? 35
        : type === "Tricycle"
          ? 25
          : 15;
  const perKm = mode === "delivery" ? 8 : type === "Car" ? 10 : 6;
  const estimate = Math.round(base + distance * perKm);
  return `Estimate SLE ${Math.max(10, estimate - 5)} - ${estimate + 8}`;
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
  if (mode === "delivery" && !hasText(form.packageDescription)) return "Add a package description for this delivery.";
  return "";
}

export default function TransportBookingDrawer({ open, target, onClose, onCreated }) {
  const initialSelection = useMemo(() => selectionFromTarget(target), [target]);
  const [selection, setSelection] = useState(initialSelection);
  const [availableFleets, setAvailableFleets] = useState([]);
  const [selectedFleetId, setSelectedFleetId] = useState(target?.fleet?.id || "");
  const [savedPlaces, setSavedPlaces] = useState([]);
  const [loadingFleets, setLoadingFleets] = useState(false);
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
  });

  const selectedFleet = useMemo(
    () => availableFleets.find((fleet) => String(fleet.id) === String(selectedFleetId)) || target?.fleet || null,
    [availableFleets, selectedFleetId, target],
  );
  const activeAvailableFleets = useMemo(() => availableFleets.filter(isFleetBookable), [availableFleets]);
  const isSelectedFleetActive = isFleetBookable(selectedFleet);
  const bookingFleet = useMemo(() => {
    if (isSelectedFleetActive) return selectedFleet;
    if (selectedFleetId && selectedFleet) return null;
    return activeAvailableFleets[0] || null;
  }, [activeAvailableFleets, isSelectedFleetActive, selectedFleet, selectedFleetId]);
  const displayFleet = bookingFleet || selectedFleet;
  const bookingMode = modeForFleet(bookingFleet || selectedFleet, selection.mode);
  const fareEstimate = estimateFare(displayFleet, bookingMode);
  const requirementMessage = getBookingRequirementMessage(form, bookingMode);
  const fleetMessage = loadingFleets
    ? "Checking active operators for this booking."
    : !bookingFleet
      ? selectedFleet
        ? "The selected operator is not active right now. Choose another active operator."
        : "No active operator matches this service and fleet type right now."
      : "";
  const sendBlockMessage = requirementMessage || fleetMessage;
  const canSendBooking = !submitting && !sendBlockMessage;

  useEffect(() => {
    if (!open) return;

    const nextSelection = selectionFromTarget(target);
    setSelection(nextSelection);
    setSelectedFleetId(target?.fleet?.id || "");
    setSavedPlaces(getTransportSavedPlaces());
    setStatus("");
    setForm((current) => ({
      ...current,
      pickup: target?.pickup || target?.movement?.pickup || current.pickup,
      dropoff: target?.destination || target?.movement?.destination || current.dropoff,
      packageDescription: "",
      note: "",
    }));
  }, [open, target]);

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

        const activeFleets = fleets.filter(isFleetBookable);
        const nextFleets = target?.fleet
          ? [target.fleet, ...activeFleets.filter((fleet) => fleet.id !== target.fleet.id)]
          : activeFleets;

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

  async function sendBooking() {
    setStatus("");

    const nextRequirementMessage = getBookingRequirementMessage(form, bookingMode);
    if (nextRequirementMessage) {
      setStatus(nextRequirementMessage);
      return;
    }

    if (!bookingFleet) {
      setStatus(fleetMessage || "Choose an active operator before sending this booking.");
      return;
    }

    try {
      setSubmitting(true);
      const nextBookingMode = modeForFleet(bookingFleet, selection.mode);
      const booking = await createTransportBooking({
        ...form,
        fleet: bookingFleet,
        mode: nextBookingMode,
        pickup: form.pickup,
        dropoff: form.dropoff,
      });
      setSelectedFleetId(bookingFleet.id || "");
      setStatus("Booking sent. The operator will see this as a pending passenger request.");
      onCreated?.(booking);
    } catch (error) {
      setStatus(error.message || "Unable to send this booking.");
    } finally {
      setSubmitting(false);
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

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
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
                      : activeAvailableFleets.length
                        ? "Auto-match best active operator"
                        : "No active operator available"}
                  </option>
                  {availableFleets.map((fleet) => (
                    <option key={fleet.id} value={fleet.id}>
                      {fleet.fleetName} - {fleet.displayType}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {displayFleet ? (
              <div className="mt-4 grid gap-2 rounded-xl bg-gray-50 p-3 text-sm font-semibold text-gray-600 sm:grid-cols-2">
                <InfoLine icon={FiTruck} label={bookingFleet && !selectedFleetId ? "Auto-match" : "Fleet"} value={`${displayFleet.fleetName} (${displayFleet.plateNumber})`} />
                <InfoLine icon={FiNavigation} label="Location" value={displayFleet.currentLocation || displayFleet.lastKnownLocation} />
                <InfoLine icon={FiClock} label="Status" value={isFleetBookable(displayFleet) ? "Active now" : displayFleet.lastActive || "Offline"} />
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
                <p className="text-sm font-black text-emerald-950">Fare guidance</p>
                <p className="mt-1 text-sm font-black text-emerald-700">{fareEstimate}</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-emerald-800">
                  The operator can confirm the final fare after accepting. Built-in transport payments are still being prepared.
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
              {sendBlockMessage || `Ready to send a pending ${bookingMode} request to ${bookingFleet?.fleetName}.`}
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
