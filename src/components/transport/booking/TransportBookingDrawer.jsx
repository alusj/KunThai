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
import useBodyScrollLock from "../../shared/useBodyScrollLock";
import {
  AddressAreaResolutionCard,
  AddressAreaStatusIcon,
  normalizeAreaLocation,
  useAddressAreaValidation,
} from "../../shared/AddressAreaValidation";
import NearbyAreaScreen from "../NearbyAreaScreen";
import { searchLocations } from "../../../Backend/services/locationSearchService";
import { getOnboardingProfile } from "../../../Backend/services/onboardingService";
import {
  constrainCountryPhoneInput,
  getCountryPhoneHint,
  validateCountryPhone,
} from "../../../data/globalCountryProfiles";
import { createTransportBooking } from "../../services/bookingService";
import { getNextTransportPlace } from "../../services/passengerTransportService";
import { haptics, sounds } from "../../../Backend/services/feedbackService";
import { fetchTransportFleets } from "../../services/transportFleetService";
import {
  calculateBookingRoute,
  describeFleetFare,
  formatBookingDistance,
} from "../../services/transportPricingService";
import { getPassengerFleetFilterOptions } from "../../../data/globalTransportCapabilities";
import { useI18n, t } from "../../../i18n";
import {
  getBookingLocationInputValue,
  normalizeBookingLocationPoint,
  resolveBookingLocationPreferences,
} from "./bookingLocationPreferences";
import { t as i18nText } from "../../../i18n/index";

const PASSENGER_CAUTION_KEY = "kunthai-passenger-booking-caution-accepted";

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
      label: target.fleet.displayType || target.fleet.fleetType || t("urride.booking.selectedFleetLabel"),
    };
  }

  return {
    mode: target?.selection?.mode === "delivery" ? "delivery" : target?.selection?.mode === "ride" ? "ride" : "topRated",
    fleetType: target?.selection?.fleetType || null,
    label: target?.selection?.label || t("urride.booking.availableTransport"),
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

function getBookingRequirementMessage(form, mode) {
  if (!hasText(form.pickup)) return t("urride.booking.needPickup");
  if (!hasText(form.dropoff)) return t("urride.booking.needDropoff");
  if (!hasText(form.passengerName)) return t("urride.booking.needName");
  const phoneValidation = validateCountryPhone(form.phone);
  if (!phoneValidation.valid) return phoneValidation.message;
  if (form.pickupTime === "schedule" && !form.scheduledAt) return t("urride.booking.needScheduledTime");
  if (form.bookingMethod === "time" && Number(form.bookedHours || 0) <= 0) return t("urride.booking.needHours");
  if (mode === "delivery" && !hasText(form.packageDescription)) return t("urride.booking.needPackage");
  return "";
}

function getBookingPickerLabels(kind, bookingMode) {
  const isPickup = kind === "pickup";
  const label = isPickup
    ? t("urride.booking.pickerNounPickup")
    : bookingMode === "delivery"
      ? t("urride.booking.pickerNounDelivery")
      : t("urride.booking.pickerNounDropoff");

  return {
    historyKey: `transport-booking-${kind}-picker`,
    backLabel: t("urride.booking.pickerBack"),
    eyebrow: t("urride.booking.pickerEyebrow"),
    cardEyebrow: isPickup ? t("urride.booking.pickerCardPickup") : bookingMode === "delivery" ? t("urride.booking.pickerCardDelivery") : t("urride.booking.pickerCardDropoff"),
    headerCurrentTitle: t("urride.booking.pickerHeaderCurrent", { label }),
    headerDropTitle: t("urride.booking.pickerHeaderDrop", { label }),
    currentHeading: t("urride.booking.pickerCurrentHeading", { label }),
    dropHeading: t("urride.booking.pickerDropHeading", { label }),
    dropInstruction: t("urride.booking.pickerDropInstruction", { label }),
    currentStatus: t("urride.booking.pickerCurrentStatus", { label }),
    dropStatus: t("urride.booking.pickerDropStatus", { label }),
    currentName: t("urride.booking.pickerCurrentName", { label }),
    droppedName: t("urride.booking.pickerDroppedName", { label }),
  };
}

export default function TransportBookingDrawer({ open, target, onClose, onCreated, onLocateArea }) {
  useI18n();
  // Freeze the page behind the ride-booking drawer so it can't scroll or be
  // tapped while the drawer is open.
  useBodyScrollLock(open);
  const initialSelection = useMemo(() => selectionFromTarget(target), [target]);
  const [selection, setSelection] = useState(initialSelection);
  const [availableFleets, setAvailableFleets] = useState([]);
  const [loadingFleets, setLoadingFleets] = useState(false);
  const [routeEstimate, setRouteEstimate] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeMessage, setRouteMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  // Whether `status` is a success (booking sent) message, tracked separately so
  // translated strings never need pattern matching for styling.
  const [statusSuccess, setStatusSuccess] = useState(false);
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
  const selectionCountry = selectedFleet?.countryCode ||
    selectedFleet?.country ||
    target?.selection?.countryCode ||
    target?.selection?.country ||
    form.pickupPoint?.countryCode ||
    form.pickupPoint?.country ||
    form.dropoffPoint?.countryCode ||
    form.dropoffPoint?.country ||
    "";
  const fleetTypes = useMemo(
    () => getPassengerFleetFilterOptions(selectionCountry, selection.mode),
    [selection.mode, selectionCountry],
  );
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
    ? t("urride.booking.checkingOperators")
    : !isDirectedBooking && !bookingTargetFleets.length
      ? t("urride.booking.noMatchingOperators")
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
    if (!open) return undefined;
    let alive = true;
    getOnboardingProfile()
      .then((profile) => {
        if (!alive || !profile) return;
        const passengerName = String(profile.displayName || profile.fullName || profile.full_name || "").trim();
        const phone = String(profile.phone || profile.phoneNumber || profile.phone_number || "").trim();
        setForm((current) => ({
          ...current,
          passengerName: current.passengerName || passengerName,
          phone: current.phone || phone,
        }));
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const nextSelection = selectionFromTarget(target);
    const draftForm = target?.draftForm || null;
    const preferredPickupPlace = getNextTransportPlace("pickup");
    const preferredDropoffPlace = getNextTransportPlace("dropoff");
    const preferredLocations = resolveBookingLocationPreferences({
      target,
      draftForm,
      preferredPickupPlace,
      preferredDropoffPlace,
    });
    setSelection(nextSelection);
    setStatus("");
    setRouteEstimate(null);
    setRouteMessage("");
    setAreaPicker(null);
    setForm((current) => ({
      ...current,
      ...(draftForm || {}),
      ...preferredLocations,
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
          label: t("urride.booking.currentArea"),
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
    if (!selection.fleetType) return;
    if (fleetTypes.some((type) => type.value === selection.fleetType)) return;

    setSelection((current) => ({ ...current, fleetType: null }));
  }, [fleetTypes, selection.fleetType]);

  useEffect(() => {
    if (!open || form.bookingMethod !== "distance" || !hasText(form.pickup) || !hasText(form.dropoff)) return undefined;

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
        setRouteEstimate(nextRoute);
        setRouteMessage(t("urride.booking.routeSummary", { distance: formatBookingDistance(nextRoute.distanceKm) }) + (nextRoute.approximate ? t("urride.booking.routeApproxSuffix") : ""));
      } catch (error) {
        if (!alive) return;
        setRouteEstimate(null);
        setRouteMessage(error.message || t("urride.booking.routeError"));
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
          setStatus(error.message || t("urride.booking.noOperatorsAvailable"));
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
    const nextPoint = normalizeBookingLocationPoint(nextLocation);
    if (!nextPoint) return;

    setStatusSuccess(false);
    if (areaPicker?.kind === "pickup") {
      updateForm({
        pickup: getBookingLocationInputValue(nextPoint),
        pickupPoint: nextPoint,
      });
      setStatus(t("urride.booking.pickupAdded", { address: nextPoint.address }));
    } else {
      updateForm({
        dropoff: getBookingLocationInputValue(nextPoint),
        dropoffPoint: nextPoint,
      });
      setStatus(t("urride.booking.dropoffAdded", { address: nextPoint.address }));
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
      status: i18nText("ui.literals.k418b03c91215"),
      description:
        kind === "pickup"
          ? t("urride.booking.pickupAreaDescription")
          : t("urride.booking.routeDescription", { pickup: pickupText || t("urride.booking.currentLocationFallback"), dropoff: dropoffText || areaText }),
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
      setStatusSuccess(false);
      setStatus(kind === "pickup" ? t("urride.booking.needPickupLocate") : t("urride.booking.needDropoffRoute"));
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
    setStatusSuccess(false);

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
        setRouteMessage(t("urride.booking.routeSummary", { distance: formatBookingDistance(resolvedRoute.distanceKm) }) + (resolvedRoute.approximate ? t("urride.booking.routeApproxSuffix") : ""));
      }

      if (!bookingTargetFleets.length) {
        throw new Error(t("urride.booking.noOperatorsAvailable"));
      }

      const nextBookingMode = modeForFleet(bookingFleet || null, selection.mode);
      haptics.medium("transport");
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

      sounds.success("transport");
      setStatus(
        isDirectedBooking
          ? t("urride.booking.sentDirect", { operator: selectedFleet?.operatorName || selectedFleet?.fleetName || t("urride.booking.selectedOperatorFallback") })
          : booking?.notifiedFleetCount > 1
          ? t("urride.booking.sentMultiple", { count: booking.notifiedFleetCount })
          : t("urride.booking.sentSingle"),
      );
      setStatusSuccess(true);

      onCreated?.(booking);
    } catch (error) {
      setStatus(error.message || t("urride.booking.sendError"));
      setStatusSuccess(false);
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
          aria-label={t("urride.booking.closeOverlay")}
          onClick={onClose}
          className="kt-backdrop absolute inset-0"
        />

        <aside className="kt-panel-enter relative flex h-full w-full max-w-2xl flex-col bg-gray-50 shadow-2xl">
          <header className="kt-header-glass flex items-center justify-between px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">
                {t("urride.booking.headerEyebrow")}
              </p>
              <h2 className="mt-1 truncate text-xl font-black text-gray-950">
                {bookingMode === "delivery" ? t("urride.booking.headerDelivery") : t("urride.booking.headerRide")}
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="kt-touchable flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              aria-label={t("urride.booking.close")}
            >
              <FiX size={20} />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            {status ? (
              <p
                className={`mb-4 rounded-xl p-3 text-sm font-bold ${
                  statusSuccess ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                }`}
              >
                {status}
              </p>
            ) : null}

            <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
              <label className="block space-y-1">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">{t("urride.booking.chooseMethod")}</span>
                <select
                  value={form.bookingMethod}
                  onChange={(event) => updateForm({ bookingMethod: event.target.value })}
                  className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
                >
                  <option value="distance">{t("urride.booking.byDistance")}</option>
                  <option value="time">{t("urride.booking.byTime")}</option>
                </select>
              </label>
              <p className="mt-2 text-xs font-semibold leading-5 text-gray-500">
                {form.bookingMethod === "time"
                  ? t("urride.booking.methodHintTime")
                  : t("urride.booking.methodHintDistance")}
              </p>
            </section>

            <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              {!isDirectedBooking ? <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-black uppercase text-gray-500">{t("urride.booking.service")}</span>
                  <select
                    value={selection.mode}
                    onChange={(event) => updateSelection({ mode: event.target.value })}
                    className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
                  >
                    <option value="topRated">{t("urride.booking.anyService")}</option>
                    <option value="ride">{t("urride.booking.ride")}</option>
                    <option value="delivery">{t("urride.booking.delivery")}</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-black uppercase text-gray-500">{t("urride.booking.fleetType")}</span>
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
                  <p className="text-xs font-black uppercase tracking-wide text-blue-700">{t("urride.booking.directBooking")}</p>
                  <p className="mt-1 text-lg font-black text-blue-950">
                    {selectedFleet?.operatorName || selectedFleet?.fleetName || t("urride.booking.selectedOperator")}
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-blue-800">
                    {t("urride.booking.directNotice")}
                  </p>
                  <p className="mt-2 text-xs font-black text-blue-700">
                    {[selectedFleet?.operatorId, selectedFleet?.displayType || selectedFleet?.fleetType, selectedFleet?.plateNumber]
                      .filter(Boolean)
                      .join(" - ")}
                  </p>
                </div>
              ) : <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                <p className="text-sm font-black text-emerald-950">{t("urride.booking.openRequest")}</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-emerald-800">
                  {t("urride.booking.openRequestBody")}
                </p>
                <p className="mt-2 text-xs font-black text-emerald-700">
                  {loadingFleets
                    ? t("urride.booking.checkingMatching")
                    : t(bookingTargetFleets.length === 1 ? "urride.booking.operatorsReadyOne" : "urride.booking.operatorsReady", { count: bookingTargetFleets.length, active: nearbyActiveFleets.length })}
                </p>
              </div>}

              {displayFleet ? (
                <div className="mt-4 grid gap-2 rounded-xl bg-gray-50 p-3 text-sm font-semibold text-gray-600 sm:grid-cols-2">
                  <InfoLine
                    icon={FiTruck}
                    label={t("urride.booking.requestLabel")}
                    value={isDirectedBooking
                      ? t("urride.booking.onlyNotified", { operator: selectedFleet?.operatorName || selectedFleet?.fleetName || t("urride.booking.selectedOperatorFallback") })
                      : t(bookingTargetFleets.length === 1 ? "urride.booking.countNotifiedOne" : "urride.booking.countNotified", { count: bookingTargetFleets.length })}
                  />
                  <InfoLine icon={FiNavigation} label={t("urride.booking.locationLabel")} value={displayFleet.currentLocation || displayFleet.lastKnownLocation} />
                  <InfoLine
                    icon={FiClock}
                    label={t("urride.booking.operatorStatusLabel")}
                    value={
                      isFleetBookable(displayFleet)
                        ? isDirectedBooking ? t("urride.booking.selectedActiveNow") : t("urride.booking.oneMatchingActive")
                        : t("urride.booking.offlineAlerts", { status: displayFleet.lastActive || t("urride.booking.offlineFallback") })
                    }
                  />
                  <InfoLine icon={FiCreditCard} label={t("urride.booking.fareLabel")} value={fareEstimate} />
                </div>
              ) : null}
            </section>

            <section className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700">
                  <FiCreditCard size={19} />
                </span>
                <div>
                  <p className="text-sm font-black text-emerald-950">{t("urride.booking.calculatedFare")}</p>
                  <p className="mt-1 text-sm font-black text-emerald-700">{fareEstimate}</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-emerald-800">
                    {form.bookingMethod === "distance"
                      ? t("urride.booking.fareHintDistance", { route: routeEstimate ? t("urride.booking.fareHintRoutePart", { distance: formatBookingDistance(routeEstimate.distanceKm) }) : "" })
                      : t(Number(form.bookedHours || 0) === 1 ? "urride.booking.fareHintTimeOne" : "urride.booking.fareHintTime", { hours: Number(form.bookedHours || 0) })}
                  </p>
                </div>
              </div>
            </section>

            <section className="mt-4 grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <AddressSuggestionInput
                  icon={FiMapPin}
                  label={t("urride.booking.pickupPointLabel")}
                  value={form.pickup}
                  selectedPoint={form.pickupPoint}
                  center={searchCenter || form.dropoffPoint}
                  onChange={(value) => updateForm({ pickup: value, pickupPoint: null })}
                  onSelect={(place) => updateForm({
                    pickup: getBookingLocationInputValue(place),
                    pickupPoint: normalizeBookingLocationPoint(place),
                  })}
                  onLocateMe={() => openBookingLocationPicker("pickup", "current")}
                  onDropPin={() => openBookingLocationPicker("pickup", "dropPin")}
                  placeholder={t("urride.booking.pickupPlaceholder")}
                />

                <AddressSuggestionInput
                  icon={FiNavigation}
                  label={bookingMode === "delivery" ? t("urride.booking.deliveryDropoffLabel") : t("urride.booking.dropoffPointLabel")}
                  value={form.dropoff}
                  selectedPoint={form.dropoffPoint}
                  center={form.pickupPoint || searchCenter}
                  onChange={(value) => updateForm({ dropoff: value, dropoffPoint: null })}
                  onSelect={(place) => updateForm({
                    dropoff: getBookingLocationInputValue(place),
                    dropoffPoint: normalizeBookingLocationPoint(place),
                  })}
                  onLocateMe={() => openBookingLocationPicker("dropoff", "current")}
                  onDropPin={() => openBookingLocationPicker("dropoff", "dropPin")}
                  placeholder={t("urride.booking.dropoffPlaceholder")}
                />

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

              <div className="grid gap-2 sm:grid-cols-2">
                <LocateAreaButton
                  icon={FiMapPin}
                  label={t("urride.booking.locatePickup")}
                  detail={t("urride.booking.locatePickupDetail")}
                  disabled={!hasText(form.pickup)}
                  onClick={() => handleLocateArea("pickup")}
                />
                <LocateAreaButton
                  icon={FiNavigation}
                  label={t("urride.booking.routeDropoff")}
                  detail={t("urride.booking.routeDropoffDetail")}
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
                  <span>{routeMessage || t("urride.booking.routePlaceholder")}</span>
                </div>
              ) : (
                <label className="space-y-1">
                  <span className="text-xs font-black uppercase text-gray-500">{t("urride.booking.numberOfHours")}</span>
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
                  <span className="text-xs font-black uppercase text-gray-500">{t("urride.booking.pickupTime")}</span>
                  <select
                    value={form.pickupTime}
                    onChange={(event) => updateForm({ pickupTime: event.target.value })}
                    className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
                  >
                    <option value="now">{t("urride.booking.now")}</option>
                    <option value="schedule">{t("urride.booking.schedule")}</option>
                  </select>
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-black uppercase text-gray-500">{t("urride.booking.scheduledTime")}</span>
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
                  label={t("urride.booking.packageDescription")}
                  value={form.packageDescription}
                  onChange={(value) => updateForm({ packageDescription: value })}
                  placeholder={t("urride.booking.packagePlaceholder")}
                />
              ) : (
                <label className="space-y-1">
                  <span className="text-xs font-black uppercase text-gray-500">{t("urride.booking.passengers")}</span>
                  <select
                    value={form.passengers}
                    onChange={(event) => updateForm({ passengers: event.target.value })}
                    className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
                  >
                    <option value="1">{t("urride.booking.passengerCountOne", { count: 1 })}</option>
                    <option value="2">{t("urride.booking.passengerCount", { count: 2 })}</option>
                    <option value="3">{t("urride.booking.passengerCount", { count: 3 })}</option>
                    <option value="4">{t("urride.booking.passengerCount", { count: 4 })}</option>
                  </select>
                </label>
              )}

              <label className="space-y-1">
                <span className="text-xs font-black uppercase text-gray-500">{t("urride.booking.tripNote")}</span>
                <textarea
                  value={form.note}
                  onChange={(event) => updateForm({ note: event.target.value })}
                  rows={4}
                  placeholder={t("urride.booking.tripNotePlaceholder")}
                  className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-500"
                />
              </label>
            </section>

            <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <FiAlertTriangle className="mt-0.5 shrink-0 text-amber-700" size={20} />
                <div>
                  <p className="text-sm font-black text-amber-900">{t("urride.booking.paymentNotice")}</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-amber-800">
                    {t("urride.booking.paymentNoticeBody")}
                  </p>
                </div>
              </div>
            </section>
          </div>

          <footer className="border-t border-gray-100 bg-white px-4 py-3 sm:px-5">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
              <p className={`text-xs font-semibold leading-5 ${sendBlockMessage ? "text-gray-500" : "text-emerald-700"}`}>
                {requirementMessage || fleetMessage || (isDirectedBooking
                  ? t("urride.booking.readyDirected", { mode: bookingMode === "delivery" ? t("urride.booking.modeNounDelivery") : t("urride.booking.modeNounRide"), operator: selectedFleet?.operatorName || selectedFleet?.fleetName || t("urride.booking.selectedOperatorFallback") })
                  : t("urride.booking.readyOpen", { mode: bookingMode === "delivery" ? t("urride.booking.modeNounDelivery") : t("urride.booking.modeNounRide") }))}
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
                {submitting ? t("urride.booking.saving") : t("urride.booking.saveNotify")}
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
                    {t("urride.booking.cautionEyebrow")}
                  </p>
                  <h2 className="mt-1 text-xl font-black text-slate-950">
                    {t("urride.booking.cautionTitle")}
                  </h2>
                </div>
              </div>

              <div className="mt-5 grid max-h-[48vh] gap-3 overflow-y-auto pr-1 text-sm font-semibold leading-6 text-slate-600">
                <p>{t("urride.booking.cautionP1")}</p>
                <p>{t("urride.booking.cautionP2")}</p>
                <p>{t("urride.booking.cautionP3")}</p>
                <p>{t("urride.booking.cautionP4")}</p>
              </div>

              <label className="mt-5 flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <input
                  type="checkbox"
                  checked={dontShowPassengerCaution}
                  onChange={(event) => setDontShowPassengerCaution(event.target.checked)}
                  className="mt-1 h-5 w-5 accent-emerald-600"
                />
                <span className="text-sm font-bold leading-6 text-slate-700">
                  {t("urride.booking.cautionDontShow")}
                </span>
              </label>

              <button
                type="button"
                onClick={acceptPassengerCaution}
                className="mt-5 h-12 w-full rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700"
              >
                {t("urride.booking.cautionAccept")}
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
              backLabel={t("urride.booking.pickerBack")}
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

function InfoLine({ icon, label, value }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {createElement(icon, { size: 15, className: "shrink-0 text-gray-500" })}
      <span className="min-w-0">
        <span className="mr-1 text-xs font-black uppercase text-gray-400">{label}:</span>
        <span className="break-words">{value || t("urride.booking.pending")}</span>
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
          {selectedPoint.country ? t("urride.booking.addressMatchedIn", { country: selectedPoint.country }) : t("urride.booking.addressMatched")}
        </p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onLocateMe}
          className="kt-touchable inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-black text-white hover:bg-slate-800"
        >
          <FiNavigation size={15} />
          {t("urride.booking.locateMe")}
        </button>
        <button
          type="button"
          onClick={onDropPin}
          className="kt-touchable inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-black text-gray-700 hover:bg-gray-50"
        >
          <FiMapPin size={15} />
          {t("urride.booking.dropPin")}
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
            <p className="px-3 py-3 text-xs font-black uppercase tracking-wide text-gray-400">{t("urride.booking.searchingAddresses")}</p>
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
              {t("urride.booking.noAddressMatch")}
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
