import { useEffect, useMemo, useState } from "react";
import { FaCarSide, FaMotorcycle, FaShuttleVan } from "react-icons/fa";
import { MdElectricRickshaw } from "react-icons/md";
import {
  FiAlertTriangle,
  FiBox,
  FiCheckCircle,
  FiClock,
  FiMapPin,
  FiNavigation,
  FiPackage,
  FiPhone,
  FiRadio,
  FiRefreshCw,
  FiSend,
  FiUser,
  FiUsers,
  FiX,
} from "react-icons/fi";

import AppPortal from "../../shared/AppPortal";
import TransportCautionSheet, { PassengerBookingCautionBody } from "../shared/TransportCautionSheet";
import useBodyScrollLock from "../../shared/useBodyScrollLock";
import { normalizeAreaLocation } from "../../shared/AddressAreaValidation";
import NearbyAreaScreen from "../NearbyAreaScreen";
import { getOnboardingProfile } from "../../../Backend/services/onboardingService";
import { haptics, sounds } from "../../../Backend/services/feedbackService";
import { showToast } from "../../../Backend/services/toastService";
import { inlineErrorMessage, shortErrorToast } from "../../../Backend/services/friendlyErrorService";
import {
  constrainCountryPhoneInput,
  formatCountryMoney,
  getActiveCountryProfile,
  getCountryPhoneHint,
  validateCountryPhone,
} from "../../../data/globalCountryProfiles";
import { getTransportCapabilities } from "../../../data/globalTransportCapabilities";
import { getTransportSavedPlaces, TRANSPORT_SAVED_PLACES_EVENT } from "../../services/passengerTransportService";
import { fetchTransportFleets } from "../../services/transportFleetService";
import { calculateBookingRoute, formatBookingDistance } from "../../services/transportPricingService";
import { buildFareOffers, createOpenBooking, maxPassengersForVehicle, roundOfferAmount } from "../../services/openBookingService";
import { AddressSuggestionInput, FormInput, getBookingPickerLabels } from "./TransportBookingDrawer";
import { PassengerCountSelect, PickupTimeFields } from "./bookingFields";
import { getBookingLocationInputValue, normalizeBookingLocationPoint } from "./bookingLocationPreferences";
import { useI18n, t } from "../../../i18n";
import { uiText as translateUi } from "../../../i18n/index.js";

const RIDE_ICONS = { Motorcycle: FaMotorcycle, Tricycle: MdElectricRickshaw, Car: FaCarSide };
const DELIVERY_ICONS = { Motorcycle: FaMotorcycle, Tricycle: MdElectricRickshaw, Car: FaShuttleVan };
const OFFER_KEYS = ["economy", "average", "priority"];
const OFFER_LABELS = { economy: "Economy", average: "Average", priority: "Priority" };
const OFFER_HINTS = {
  economy: "Lower price, may take longer",
  average: "What operators usually charge",
  priority: "Higher price, faster pickup",
};

const EMPTY_FORM = {
  pickup: "",
  dropoff: "",
  pickupPoint: null,
  dropoffPoint: null,
  passengerName: "",
  phone: "",
  passengers: "1",
  packageDescription: "",
  note: "",
  pickupTime: "now",
  scheduledAt: "",
};

const OPEN_BOOKING_CAUTION_KEY = "kunthai-open-booking-caution-accepted";

function readCautionAccepted() {
  try {
    return localStorage.getItem(OPEN_BOOKING_CAUTION_KEY) === "true";
  } catch {
    return false;
  }
}

function hasText(value) {
  return String(value || "").trim().length > 1;
}

function hasCoordinates(point) {
  return Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng));
}

function StepHeading({ number, title, done }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className={`grid h-7 w-7 flex-none place-items-center rounded-full text-xs font-black ${done ? "bg-emerald-600 text-white" : "bg-slate-900 text-white"}`}>
        {done ? <FiCheckCircle size={15} aria-hidden="true" /> : number}
      </span>
      <h3 className="min-w-0 text-base font-black text-slate-950">{translateUi(title)}</h3>
    </div>
  );
}

function ChoiceCard({ active, icon, title, detail, onClick }) {
  const Icon = icon;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`kt-pressable flex min-w-0 flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-center transition ${
        active ? "border-emerald-500 bg-emerald-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <span className={`grid h-11 w-11 place-items-center rounded-2xl text-xl ${active ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"}`}>
        <Icon aria-hidden="true" />
      </span>
      <span className="min-w-0 break-words text-sm font-black text-slate-950">{title}</span>
      {detail ? <span className="min-w-0 break-words text-[11px] font-bold leading-4 text-slate-500">{detail}</span> : null}
    </button>
  );
}

/**
 * Open booking: ride or delivery -> vehicle -> route and details -> fare
 * offer. No operator is chosen; the nearest online operators of that vehicle
 * type are notified and the first to accept takes the trip.
 */
export default function OpenBookingSheet({ open, onClose, onOpenTrips }) {
  useI18n();
  useBodyScrollLock(open);
  const country = getActiveCountryProfile();
  const currency = country.currency.code;
  const capabilities = useMemo(() => getTransportCapabilities(country.iso2), [country.iso2]);

  const [mode, setMode] = useState("");
  const [fleetType, setFleetType] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [route, setRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeMessage, setRouteMessage] = useState("");
  const [searchCenter, setSearchCenter] = useState(null);
  const [savedPlaces, setSavedPlaces] = useState(getTransportSavedPlaces);
  const [areaPicker, setAreaPicker] = useState(null);
  const [priceFleets, setPriceFleets] = useState([]);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [offerChoice, setOfferChoice] = useState("average");
  const [customAmount, setCustomAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [session, setSession] = useState(0);
  const [showCaution, setShowCaution] = useState(false);
  const [dontShowCaution, setDontShowCaution] = useState(false);

  const vehicleOptions = mode === "delivery" ? capabilities.deliveryOptions : mode === "ride" ? capabilities.rideOptions : [];
  const vehicle = vehicleOptions.find((option) => option.value === fleetType) || null;
  const offers = useMemo(
    () => buildFareOffers(priceFleets, { distanceKm: route?.distanceKm || 0 }),
    [priceFleets, route?.distanceKm],
  );
  const offerAmount = offerChoice === "custom" ? roundOfferAmount(customAmount) : Number(offers?.[offerChoice] || 0);
  const pickupPoint = hasCoordinates(form.pickupPoint) ? form.pickupPoint : hasCoordinates(route?.pickupPoint) ? route.pickupPoint : null;
  const maxPassengers = maxPassengersForVehicle(fleetType);

  // A smaller vehicle never keeps more passengers than it seats.
  useEffect(() => {
    if (Number(form.passengers) > maxPassengers) setForm((current) => ({ ...current, passengers: String(maxPassengers) }));
  }, [form.passengers, maxPassengers]);

  // Fresh sheet every time it opens.
  useEffect(() => {
    if (!open) return undefined;
    setMode("");
    setFleetType("");
    setForm(EMPTY_FORM);
    setRoute(null);
    setRouteMessage("");
    setAreaPicker(null);
    setOfferChoice("average");
    setCustomAmount("");
    setNotice("");
    setShowCaution(!readCautionAccepted());
    setDontShowCaution(false);
    setSavedPlaces(getTransportSavedPlaces());
    setSession((value) => value + 1);

    let alive = true;
    getOnboardingProfile()
      .then((profile) => {
        if (!alive || !profile) return;
        setForm((current) => ({
          ...current,
          passengerName: current.passengerName || String(profile.displayName || profile.fullName || "").trim(),
          phone: current.phone || String(profile.phone || "").trim(),
        }));
      })
      .catch(() => null);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          if (alive) setSearchCenter({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy, label: t("urride.booking.currentArea") });
        },
        () => {
          if (alive) setSearchCenter(null);
        },
        { enableHighAccuracy: true, maximumAge: 60000, timeout: 6500 },
      );
    }

    const refreshSavedPlaces = () => setSavedPlaces(getTransportSavedPlaces());
    window.addEventListener(TRANSPORT_SAVED_PLACES_EVENT, refreshSavedPlaces);
    return () => {
      alive = false;
      window.removeEventListener(TRANSPORT_SAVED_PLACES_EVENT, refreshSavedPlaces);
    };
  }, [open]);

  // Operators' published prices for this vehicle type feed the fare offers.
  useEffect(() => {
    if (!open || !mode || !fleetType) {
      setPriceFleets([]);
      return undefined;
    }
    let alive = true;
    setPricesLoading(true);
    fetchTransportFleets({ mode, fleetType, includeOffline: true })
      .then((fleets) => {
        if (alive) setPriceFleets(fleets || []);
      })
      .catch(() => {
        if (alive) setPriceFleets([]);
      })
      .finally(() => {
        if (alive) setPricesLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [fleetType, mode, open]);

  // No published prices: the passenger names their own amount.
  useEffect(() => {
    if (!pricesLoading && fleetType && !offers && offerChoice !== "custom") setOfferChoice("custom");
  }, [fleetType, offerChoice, offers, pricesLoading]);

  useEffect(() => {
    if (!open || !hasText(form.pickup) || !hasText(form.dropoff)) return undefined;
    let alive = true;
    const timer = window.setTimeout(async () => {
      try {
        setRouteLoading(true);
        setRouteMessage(t("urride.booking.calculatingRoute"));
        const nextRoute = await calculateBookingRoute(form.pickup, form.dropoff, {
          pickupPoint: form.pickupPoint,
          destinationPoint: form.dropoffPoint,
          center: searchCenter,
        });
        if (!alive) return;
        setRoute(nextRoute);
        setRouteMessage(
          t("urride.booking.routeSummary", { distance: formatBookingDistance(nextRoute.distanceKm) })
            + (nextRoute.approximate ? t("urride.booking.routeApproxSuffix") : ""),
        );
      } catch (error) {
        if (!alive) return;
        setRoute(null);
        setRouteMessage(inlineErrorMessage(error, t("urride.booking.routeError")));
      } finally {
        if (alive) setRouteLoading(false);
      }
    }, 650);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [form.dropoff, form.dropoffPoint, form.pickup, form.pickupPoint, open, searchCenter]);

  if (!open) return null;

  function updateForm(patch) {
    setNotice("");
    setForm((current) => ({ ...current, ...patch }));
  }

  function chooseMode(nextMode) {
    if (nextMode === mode) return;
    haptics.light("transport");
    setMode(nextMode);
    setFleetType("");
    setNotice("");
  }

  function chooseVehicle(value) {
    haptics.light("transport");
    setFleetType(value);
    setOfferChoice("average");
    setNotice("");
  }

  function acceptLocation(location) {
    const nextPoint = normalizeBookingLocationPoint(normalizeAreaLocation(location, areaPicker?.kind === "pickup" ? form.pickup : form.dropoff));
    if (!nextPoint) return;
    if (areaPicker?.kind === "pickup") {
      updateForm({ pickup: getBookingLocationInputValue(nextPoint), pickupPoint: nextPoint });
    } else {
      updateForm({ dropoff: getBookingLocationInputValue(nextPoint), dropoffPoint: nextPoint });
    }
    setAreaPicker(null);
  }

  function requirementMessage() {
    if (!mode) return translateUi("Choose ride or delivery.");
    if (!vehicle) return translateUi("Choose a vehicle.");
    if (!hasText(form.pickup)) return t("urride.booking.needPickup");
    if (!hasText(form.dropoff)) return t("urride.booking.needDropoff");
    if (routeLoading) return t("urride.booking.calculatingRoute");
    if (!pickupPoint) return translateUi("Use Locate me or Drop pin for your pickup so nearby operators can be found.");
    if (!hasText(form.passengerName)) return t("urride.booking.needName");
    const phone = validateCountryPhone(form.phone);
    if (!phone.valid) return phone.message;
    if (mode === "delivery" && !hasText(form.packageDescription)) return t("urride.booking.needPackage");
    if (form.pickupTime === "schedule" && !form.scheduledAt) return t("urride.booking.needScheduledTime");
    if (form.pickupTime === "schedule" && new Date(form.scheduledAt).getTime() < Date.now()) return translateUi("Choose a pickup time in the future.");
    if (!(offerAmount > 0)) return translateUi("Choose or enter the fare you are offering.");
    return "";
  }

  const blocker = requirementMessage();

  async function send() {
    const message = requirementMessage();
    if (message) {
      setNotice(message);
      haptics.doubleShake("transport");
      return;
    }
    setSending(true);
    setNotice("");
    try {
      haptics.medium("transport");
      const booking = await createOpenBooking({
        ...form,
        mode,
        fleetType,
        pickupPoint,
        destinationPoint: hasCoordinates(form.dropoffPoint) ? form.dropoffPoint : route?.destinationPoint || null,
        distanceKm: route?.distanceKm || null,
        offerAmount,
        currency,
        countryCode: country.iso2,
        scheduledAt: form.pickupTime === "schedule" ? form.scheduledAt : "",
      });
      if (!booking.notifiedCount) {
        // Only when no operator of this vehicle exists in the country at all.
        setNotice(translateUi("No {value0} operators are registered in your country yet. Try another vehicle.", { value0: translateUi(vehicle.displayName || vehicle.label) }));
        return;
      }
      sounds.success("transport");
      showToast("Open booking sent", "success");
      // The request now waits in Trips, where the passenger sees who accepts.
      onClose?.();
      onOpenTrips?.(booking);
    } catch (error) {
      setNotice(inlineErrorMessage(error, translateUi("Unable to send this open booking.")));
      showToast(shortErrorToast(error, "Open booking not sent"), "danger");
    } finally {
      setSending(false);
    }
  }

  const modeNoun = mode === "delivery" ? t("urride.booking.delivery") : t("urride.booking.ride");

  return (
    <AppPortal>
      <div className="fixed inset-0 z-[1200] flex justify-end">
        <button type="button" aria-label={t("urride.booking.closeOverlay")} onClick={onClose} className="kt-backdrop absolute inset-0" />

        <aside className="kt-panel-enter relative flex h-full w-full max-w-2xl flex-col bg-gray-50 shadow-2xl" aria-labelledby="open-booking-title">
          <header className="kt-header-glass flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-emerald-600 text-white">
                <FiRadio size={19} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">UrRide</p>
                <h2 id="open-booking-title" className="truncate text-xl font-black text-gray-950">{translateUi("Open booking")}</h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="kt-touchable flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              aria-label={t("urride.booking.close")}
            >
              <FiX size={20} />
            </button>
          </header>

          {(
            <>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
                <p className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-semibold leading-6 text-emerald-900">
                  {translateUi("No operator to choose: the nearest operators get your request and the first to accept takes the trip.")}
                </p>

                <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <StepHeading number={1} title="Ride or delivery" done={Boolean(mode)} />
                  <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={translateUi("Ride or delivery")}>
                    <ChoiceCard active={mode === "ride"} icon={FiUsers} title={t("urride.booking.ride")} detail={translateUi("Move people")} onClick={() => chooseMode("ride")} />
                    <ChoiceCard active={mode === "delivery"} icon={FiPackage} title={t("urride.booking.delivery")} detail={translateUi("Send a package")} onClick={() => chooseMode("delivery")} />
                  </div>
                </section>

                {mode ? (
                  <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <StepHeading number={2} title="Choose a vehicle" done={Boolean(vehicle)} />
                    <div className={`grid gap-3 ${vehicleOptions.length >= 3 ? "grid-cols-3" : vehicleOptions.length === 2 ? "grid-cols-2" : "grid-cols-1"}`} role="radiogroup" aria-label={translateUi("Choose a vehicle")}>
                      {vehicleOptions.map((option) => (
                        <ChoiceCard
                          key={option.value}
                          active={fleetType === option.value}
                          icon={(mode === "delivery" ? DELIVERY_ICONS : RIDE_ICONS)[option.value] || FaCarSide}
                          title={translateUi(option.label)}
                          onClick={() => chooseVehicle(option.value)}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                {vehicle ? (
                  <>
                    <section className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                      <StepHeading number={3} title="Route and details" done={Boolean(pickupPoint && hasText(form.dropoff))} />
                      <div className="grid gap-3 md:grid-cols-2">
                        <AddressSuggestionInput
                          key={`open-pickup-${session}`}
                          icon={FiMapPin}
                          savedPlaces={savedPlaces}
                          label={t("urride.booking.pickupPointLabel")}
                          value={form.pickup}
                          selectedPoint={form.pickupPoint}
                          center={searchCenter || form.dropoffPoint}
                          onChange={(value) => updateForm({ pickup: value, pickupPoint: null })}
                          onSelect={(place) => updateForm({ pickup: getBookingLocationInputValue(place), pickupPoint: normalizeBookingLocationPoint(place) })}
                          onLocateMe={() => setAreaPicker({ kind: "pickup", start: "current" })}
                          onDropPin={() => setAreaPicker({ kind: "pickup", start: "dropPin" })}
                          placeholder={t("urride.booking.pickupPlaceholder")}
                        />
                        <AddressSuggestionInput
                          key={`open-dropoff-${session}`}
                          icon={FiNavigation}
                          savedPlaces={savedPlaces}
                          label={mode === "delivery" ? t("urride.booking.deliveryDropoffLabel") : t("urride.booking.dropoffPointLabel")}
                          value={form.dropoff}
                          selectedPoint={form.dropoffPoint}
                          center={form.pickupPoint || searchCenter}
                          onChange={(value) => updateForm({ dropoff: value, dropoffPoint: null })}
                          onSelect={(place) => updateForm({ dropoff: getBookingLocationInputValue(place), dropoffPoint: normalizeBookingLocationPoint(place) })}
                          onLocateMe={() => setAreaPicker({ kind: "dropoff", start: "current" })}
                          onDropPin={() => setAreaPicker({ kind: "dropoff", start: "dropPin" })}
                          placeholder={t("urride.booking.dropoffPlaceholder")}
                        />
                      </div>

                      <div className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-sm font-bold ${
                        route ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"
                      }`}>
                        <FiRefreshCw className={routeLoading ? "animate-spin" : ""} size={17} aria-hidden="true" />
                        <span className="min-w-0">{translateUi(routeMessage) || t("urride.booking.routePlaceholder")}</span>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <FormInput
                          icon={FiUser}
                          label={t("urride.booking.passengerName")}
                          value={form.passengerName}
                          onChange={(value) => updateForm({ passengerName: value })}
                          placeholder={t("urride.booking.passengerNamePlaceholder")}
                        />
                        <FormInput
                          icon={FiPhone}
                          label={t("urride.booking.phone")}
                          value={form.phone}
                          onChange={(value) => updateForm({ phone: constrainCountryPhoneInput(value, "", { international: true }) })}
                          placeholder={getCountryPhoneHint()}
                        />
                      </div>

                      {mode === "delivery" ? (
                        <FormInput
                          icon={FiBox}
                          label={t("urride.booking.packageDescription")}
                          value={form.packageDescription}
                          onChange={(value) => updateForm({ packageDescription: value })}
                          placeholder={t("urride.booking.packagePlaceholder")}
                        />
                      ) : (
                        <label className="space-y-1">
                          <span className="text-xs font-black uppercase text-gray-500">{t("urride.booking.passengers")}</span>
                          <PassengerCountSelect value={form.passengers} max={maxPassengers} onChange={(value) => updateForm({ passengers: value })} />
                        </label>
                      )}

                      <PickupTimeFields
                        pickupTime={form.pickupTime}
                        scheduledAt={form.scheduledAt}
                        onChange={(patch) => updateForm(patch)}
                      />

                      <label className="space-y-1">
                        <span className="text-xs font-black uppercase text-gray-500">{t("urride.booking.tripNote")}</span>
                        <textarea
                          value={form.note}
                          onChange={(event) => updateForm({ note: event.target.value })}
                          rows={3}
                          placeholder={t("urride.booking.tripNotePlaceholder")}
                          className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-500"
                        />
                      </label>
                    </section>

                    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                      <StepHeading number={4} title="Your fare offer" done={offerAmount > 0} />
                      {pricesLoading ? (
                        <p className="rounded-xl bg-slate-50 px-3 py-3 text-sm font-bold text-slate-500">{translateUi("Checking what operators charge...")}</p>
                      ) : offers ? (
                        <>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={translateUi("Your fare offer")}>
                            {OFFER_KEYS.map((key) => (
                              <button
                                key={key}
                                type="button"
                                role="radio"
                                aria-checked={offerChoice === key}
                                onClick={() => setOfferChoice(key)}
                                className={`kt-pressable flex min-w-0 flex-row items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition sm:flex-col sm:items-start sm:justify-start ${
                                  offerChoice === key ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-300"
                                }`}
                              >
                                <span className="min-w-0">
                                  <span className="block text-xs font-black uppercase tracking-wide text-slate-500">{translateUi(OFFER_LABELS[key])}</span>
                                  <span className="mt-0.5 block break-words text-[11px] font-bold leading-4 text-slate-500">{translateUi(OFFER_HINTS[key])}</span>
                                </span>
                                <span className="flex-none text-lg font-black text-slate-950">{formatCountryMoney(offers[key], currency)}</span>
                              </button>
                            ))}
                          </div>
                          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                            {route?.distanceKm
                              ? translateUi("Based on what {value0} operators charge for about {value1}.", { value0: offers.sampleSize, value1: formatBookingDistance(route.distanceKm) })
                              : translateUi("Based on what {value0} operators charge. Add both points for a route-based price.", { value0: offers.sampleSize })}
                          </p>
                        </>
                      ) : (
                        <p className="rounded-xl bg-amber-50 px-3 py-3 text-sm font-bold text-amber-800">
                          {translateUi("Operators of this vehicle have not published prices yet. Enter the fare you are offering.")}
                        </p>
                      )}

                      <label className={`mt-3 flex items-center gap-3 rounded-2xl border px-4 py-3 ${offerChoice === "custom" ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                        <input
                          type="radio"
                          name="open-booking-offer"
                          checked={offerChoice === "custom"}
                          onChange={() => setOfferChoice("custom")}
                          className="h-5 w-5 flex-none accent-emerald-600"
                        />
                        <span className="min-w-0 flex-1 text-sm font-black text-slate-800">{translateUi("Own amount")}</span>
                        <span className="flex flex-none items-center gap-2">
                          <span className="text-sm font-black text-slate-500">{currency}</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="1"
                            step="1"
                            value={customAmount}
                            onFocus={() => setOfferChoice("custom")}
                            onChange={(event) => {
                              setOfferChoice("custom");
                              setCustomAmount(event.target.value);
                            }}
                            placeholder={translateUi("Amount")}
                            aria-label={translateUi("Own amount")}
                            className="h-10 w-28 rounded-xl border border-slate-200 bg-white px-3 text-right text-sm font-black text-slate-950 outline-none focus:border-emerald-500"
                          />
                        </span>
                      </label>
                    </section>

                    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <div className="flex items-start gap-3">
                        <FiAlertTriangle className="mt-0.5 shrink-0 text-amber-700" size={20} aria-hidden="true" />
                        <div>
                          <p className="text-sm font-black text-amber-900">{t("urride.booking.paymentNotice")}</p>
                          <p className="mt-1 text-xs font-semibold leading-5 text-amber-800">{t("urride.booking.paymentNoticeBody")}</p>
                        </div>
                      </div>
                    </section>
                  </>
                ) : null}
              </div>

              <footer className="border-t border-gray-100 bg-white px-4 py-3 sm:px-5">
                {notice ? (
                  <p role="alert" className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">{translateUi(notice)}</p>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                  <p className={`text-xs font-semibold leading-5 ${blocker ? "text-gray-500" : "text-emerald-700"}`}>
                    {blocker || translateUi("Ready: your {value0} request goes to the nearest {value1} operators.", { value0: modeNoun, value1: translateUi(vehicle?.label || "") })}
                  </p>
                  <button
                    type="button"
                    onClick={send}
                    disabled={sending}
                    className={`kt-touchable inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-black transition ${
                      blocker ? "bg-gray-200 text-gray-600" : "bg-emerald-600 text-white hover:bg-emerald-700"
                    }`}
                  >
                    {sending ? <FiClock size={17} aria-hidden="true" /> : <FiSend size={17} aria-hidden="true" />}
                    {sending ? translateUi("Sending...") : translateUi("Send to nearby operators")}
                  </button>
                </div>
              </footer>
            </>
          )}
        </aside>

        {showCaution ? (
          <TransportCautionSheet
            icon={FiRadio}
            eyebrow={translateUi("Open booking")}
            title={t("urride.booking.cautionTitle")}
            titleId="open-booking-caution-title"
            dontShowAgain={dontShowCaution}
            onDontShowAgainChange={setDontShowCaution}
            dontShowLabel={t("urride.booking.cautionDontShow")}
            confirmLabel={t("urride.booking.cautionAccept")}
            onConfirm={() => {
              if (dontShowCaution) {
                try {
                  localStorage.setItem(OPEN_BOOKING_CAUTION_KEY, "true");
                } catch {
                  // Storage is optional: the card simply shows again next time.
                }
              }
              setShowCaution(false);
            }}
          >
            {/* Everything the selected-fleet caution says applies here too, so
                it comes first; the open-booking rules follow. */}
            <p className="mb-2 text-xs font-black uppercase tracking-wide text-emerald-700">{t("urride.booking.cautionEyebrow")}</p>
            <PassengerBookingCautionBody />
            <h3 className="mb-2 mt-5 text-xs font-black uppercase tracking-wide text-emerald-700">{translateUi("How open booking works")}</h3>
            <ol className="grid list-decimal gap-3 rounded-2xl border border-slate-100 bg-white py-4 pl-9 pr-4 text-sm font-semibold leading-6 text-slate-600 shadow-sm">
                <li>{translateUi("You do not pick an operator. KunThai sends your request to the nearest online operators of the vehicle you choose; if none are online nearby, active operators in your country receive it.")}</li>
                <li>{translateUi("The first operator to accept takes your trip. The other requests are withdrawn at once, and Trips shows only your one trip.")}</li>
                <li>{translateUi("Operators see the fare you offer and decide whether to accept it. Average or Priority usually gets a faster pickup.")}</li>
                <li>{translateUi("Before you ride or hand over a package, check the operator's name and plate in Trips. Built-in payments are not active yet: agree the fare in person and never share PINs or OTPs.")}</li>
            </ol>
          </TransportCautionSheet>
        ) : null}

        {areaPicker ? (
          <div className="fixed inset-0 z-[1200] bg-slate-950">
            <NearbyAreaScreen
              mode="businessLocationPicker"
              pickerStart={areaPicker.start}
              pickerLabels={getBookingPickerLabels(areaPicker.kind, mode)}
              backLabel={t("urride.booking.pickerBack")}
              onBack={() => setAreaPicker(null)}
              onLocationPicked={acceptLocation}
            />
          </div>
        ) : null}
      </div>
    </AppPortal>
  );
}
