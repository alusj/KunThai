import { useSyncExternalStore } from "react";

import { getLocale, uiText } from "../../../i18n/index.js";
import { KAI_TRIP_FLOW_COPY } from "../../../i18n/kaiTripFlow";
import { searchLocations } from "../locationSearchService";
import { getPreciseCurrentPosition } from "../../utils/precisePosition";
import { cleanAddressString } from "../../utils/geoAddress";
import { getOnboardingProfile } from "../onboardingService";
import { formatCountryMoney, getActiveCountryProfile, validateCountryPhone } from "../../../data/globalCountryProfiles";
import { getTransportCapabilities } from "../../../data/globalTransportCapabilities";
import { getTransportSavedPlaces } from "../../../components/services/passengerTransportService";
import { findBookableFleetByCode } from "../../../components/services/transportFleetService";
import { estimateOpenBookingFares, maxPassengersForVehicle, roundOfferAmount } from "../../../components/services/openBookingService";
import { calculateBookingRoute } from "../../../components/services/transportPricingService";
import { getBookingLocationInputValue, normalizeBookingLocationPoint } from "../../../components/transport/booking/bookingLocationPreferences";
import { openKaiTripBooking } from "./aiEntityNavigation";
import { cancelFormGuide } from "./formGuideFlow";

// KAI — guided UrRide booking.
//
// "Plan trip" on a place KAI found no longer jumps to the map. KAI asks the
// booking questions in the chat, one at a time: open booking or a chosen
// operator (by their code only), then everything the booking form needs. The
// answers are handed to UrRide's REAL booking form, already filled in; the
// passenger checks it there and presses Send. KAI never books anything.
//
// The flow is deterministic (no model call per question), so it cannot skip a
// question, invent an operator, or send a booking by itself.

let state = idleState();
const listeners = new Set();
let runToken = 0;

function idleState() {
  return { active: false, place: null, transcript: [], question: null, busy: "", data: {} };
}

function emit(patch) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTripBookingFlow() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function getTripBookingFlow() {
  return state;
}

/** Copy in the person's language (falls back to English). */
export function tripText(key, vars = null) {
  const copy = KAI_TRIP_FLOW_COPY[getLocale()] || KAI_TRIP_FLOW_COPY.en;
  const template = copy[key] ?? KAI_TRIP_FLOW_COPY.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (vars[name] !== undefined && vars[name] !== null ? String(vars[name]) : match));
}

let messageSeq = 0;
function message(from, text, extra = {}) {
  messageSeq += 1;
  return { id: `trip-${Date.now().toString(36)}-${messageSeq}`, from, text, ...extra };
}

function say(text, extra = {}) {
  emit({ transcript: [...state.transcript, message("kai", text, extra)] });
}

function ask(step, text, { options = [], input = null, card = null } = {}) {
  emit({
    transcript: [...state.transcript, message("kai", text, card ? { card } : {})],
    question: { step, options, input },
    busy: "",
  });
}

function answered(label) {
  emit({ transcript: [...state.transcript, message("user", label)], question: null });
}

function setData(patch) {
  emit({ data: { ...state.data, ...patch } });
}

function country() {
  return getActiveCountryProfile();
}

// What the operator reads: the place's name AND its address ("Central
// Market, Main Street"), not the address alone.
function placeText(point, fallbackName = "") {
  const address = getBookingLocationInputValue(point);
  const name = String(point?.name || fallbackName || "").trim();
  if (!name || name === address || address.toLowerCase().includes(name.toLowerCase())) return address || name;
  return address ? `${name}, ${address}` : name;
}

// --- start / stop ------------------------------------------------------------

/** Start (or restart) the guided booking for a place KAI's place search found. */
export function startTripBooking(place) {
  cancelFormGuide({ silent: true });
  const dropoffPoint = normalizeBookingLocationPoint(place);
  runToken += 1;
  state = idleState();
  emit({
    active: true,
    place,
    data: {
      dropoff: placeText(dropoffPoint, place?.name) || place?.name || "",
      dropoffPoint,
      dropoffName: place?.name || "",
    },
  });
  ask("method", tripText("intro", { place: place?.name || "" }), {
    options: [
      { value: "open", label: tripText("methodOpen"), hint: tripText("methodOpenHint") },
      { value: "operator", label: tripText("methodOperator"), hint: tripText("methodOperatorHint") },
    ],
  });
}

export function cancelTripBooking({ silent = false } = {}) {
  // Silent = "New chat": wipe everything, including a finished or cancelled
  // booking's messages (those are no longer `active` but still on screen).
  if (silent) {
    runToken += 1;
    state = idleState();
    emit({});
    return;
  }
  if (!state.active) return;
  runToken += 1;
  emit({ question: null, busy: "" });
  say(tripText("cancelled"));
  emit({ active: false });
}

export function restartTripBooking() {
  if (state.place) startTripBooking(state.place);
}

// --- answering -----------------------------------------------------------------

/** The person tapped one of the current question's options. */
export function chooseTripOption(value) {
  const question = state.question;
  if (!question || state.busy) return;
  const option = question.options.find((item) => item.value === value);
  if (!option) return;
  answered(option.label);
  handle(question.step, option.value, option);
}

/** Whether typed chat text should go to the flow instead of the AI model. */
export function tripFlowWantsText() {
  return Boolean(state.active && state.question);
}

/** The person typed an answer in the chat box. */
export function submitTripText(raw) {
  const question = state.question;
  const text = String(raw || "").trim();
  if (!question || !text || state.busy) return;

  if (!question.input) {
    // A typed answer to a choice question: accept it when it names an option.
    const lowered = text.toLowerCase();
    const option = question.options.find((item) => item.label.toLowerCase() === lowered || String(item.value).toLowerCase() === lowered);
    answered(text);
    if (option) handle(question.step, option.value, option);
    else ask(question.step, tripText("chooseOption"), { options: question.options });
    return;
  }
  answered(text);
  handle(question.step, text, null, { typed: true });
}

/** A date/time answer from the inline picker ("YYYY-MM-DDTHH:mm"). */
export function submitTripDateTime(value) {
  const question = state.question;
  if (!question || question.step !== "whenAt" || !value) return;
  const when = new Date(value);
  if (Number.isNaN(when.getTime()) || when.getTime() < Date.now()) {
    ask("whenAt", tripText("timeInPast"), { input: { type: "datetime" } });
    return;
  }
  answered(when.toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }));
  setData({ pickupTime: "schedule", scheduledAt: value });
  askContact();
}

// --- the questions -----------------------------------------------------------

function handle(step, value, option, { typed = false } = {}) {
  switch (step) {
    case "method":
      setData({ kind: value });
      if (value === "operator") ask("operatorCode", tripText("askCode"), { input: { type: "text", placeholder: tripText("codePlaceholder") } });
      else askMode();
      return;
    case "operatorCode":
      return lookupOperator(value);
    case "mode":
      setData({ mode: value });
      return askVehicle();
    case "vehicle":
      setData({ fleetType: value, vehicleLabel: option?.label || value });
      return askPickup();
    case "pickup":
      if (value === "__current") return locateCurrentPickup();
      if (!typed && option?.place) return setPickup(option.place);
      return searchPickup(value);
    case "passengers": {
      const count = Math.round(Number(String(value).replace(/[^\d]/g, "")));
      const max = maxPassengers();
      if (!Number.isFinite(count) || count < 1) return ask("passengers", tripText("invalidNumber"), passengerQuestion());
      setData({ passengers: String(Math.min(count, max)) });
      return askBillingOrWhen();
    }
    case "package":
      setData({ packageDescription: String(value).slice(0, 200) });
      return askBillingOrWhen();
    case "billing":
      setData({ bookingMethod: value });
      if (value === "time") {
        return ask("hours", tripText("askHours"), {
          options: [1, 2, 3, 4, 6, 8].map((n) => ({ value: String(n), label: tripText("hoursValue", { n }) })),
          input: { type: "number", placeholder: "1" },
        });
      }
      return askWhen();
    case "hours": {
      const hours = Number(String(value).replace(/[^\d.]/g, ""));
      if (!(hours > 0)) return ask("hours", tripText("invalidNumber"), { input: { type: "number", placeholder: "1" } });
      setData({ bookedHours: String(Math.min(24, Math.round(hours * 2) / 2)) });
      return askWhen();
    }
    case "when":
      if (value === "later") return ask("whenAt", tripText("askTime"), { input: { type: "datetime" } });
      setData({ pickupTime: "now", scheduledAt: "" });
      return askContact();
    case "contact":
      if (value === "yes") return askNote();
      return ask("name", tripText("askName"), { input: { type: "text", placeholder: tripText("namePlaceholder") } });
    case "name":
      if (String(value).trim().length < 2) return ask("name", tripText("askName"), { input: { type: "text", placeholder: tripText("namePlaceholder") } });
      setData({ passengerName: String(value).trim().slice(0, 80) });
      return ask("phone", tripText("askPhone"), { input: { type: "tel", placeholder: tripText("phonePlaceholder") } });
    case "phone": {
      const check = validateCountryPhone(value);
      if (!check.valid) return ask("phone", check.message || tripText("askPhone"), { input: { type: "tel", placeholder: tripText("phonePlaceholder") } });
      setData({ phone: String(value).trim() });
      return askNote();
    }
    case "note":
      setData({ note: value === "__none" ? "" : String(value).slice(0, 300) });
      return state.data.kind === "open" ? askFare() : showSummary();
    case "fare":
      if (value === "custom") return askAmount();
      setData({ offerChoice: value, offerAmount: Number(state.data.offers?.[value] || 0), customAmount: "" });
      return showSummary();
    case "amount": {
      const amount = roundOfferAmount(String(value).replace(/[^\d.]/g, ""));
      if (!(amount > 0)) return askAmount(tripText("invalidNumber"));
      setData({ offerChoice: "custom", customAmount: String(amount), offerAmount: amount });
      return showSummary();
    }
    case "summary":
      if (value === "review") return handOff();
      return restartTripBooking();
    default:
      return undefined;
  }
}

async function lookupOperator(code) {
  const token = runToken;
  emit({ busy: tripText("checkingCode") });
  const fleet = await findBookableFleetByCode(code).catch(() => null);
  if (token !== runToken) return;
  if (!fleet) {
    ask("operatorCode", tripText("codeNotFound", { code: String(code).trim() }), { input: { type: "text", placeholder: tripText("codePlaceholder") } });
    return;
  }
  const mode = fleet.serviceCategory === "Delivery" ? "delivery" : "ride";
  setData({ fleet, mode, fleetType: fleet.fleetType, vehicleLabel: uiText(fleet.displayType || fleet.fleetType || "") });
  const found = tripText("operatorFound", {
    name: fleet.operatorName || fleet.fleetName,
    vehicle: uiText(fleet.displayType || fleet.fleetType || ""),
    plate: fleet.plateNumber || "—",
  });
  say(fleet.activeStatus === "active" ? found : `${found} ${tripText("operatorOffline")}`, { card: { type: "operator", fleet } });
  askPickup();
}

function askMode() {
  ask("mode", tripText("askMode"), {
    options: [
      { value: "ride", label: tripText("ride") },
      { value: "delivery", label: tripText("delivery") },
    ],
  });
}

function askVehicle() {
  const capabilities = getTransportCapabilities(country().iso2);
  const list = state.data.mode === "delivery" ? capabilities.deliveryOptions : capabilities.rideOptions;
  ask("vehicle", tripText("askVehicle"), {
    options: list.map((option) => ({ value: option.value, label: uiText(option.displayName || option.label) })),
  });
}

function savedPlaceOptions() {
  return getTransportSavedPlaces()
    .map((place) => {
      const point = normalizeBookingLocationPoint(place);
      if (!point) return null;
      const label = place.label || place.title || place.name || getBookingLocationInputValue(point);
      return label ? { value: `saved:${place.id}`, label: String(label).slice(0, 48), place: point } : null;
    })
    .filter(Boolean)
    .slice(0, 4);
}

function askPickup(prefix = "") {
  ask("pickup", prefix || tripText("askPickup"), {
    options: [{ value: "__current", label: tripText("useCurrent") }, ...savedPlaceOptions()],
    input: { type: "text", placeholder: tripText("pickupPlaceholder") },
  });
}

async function reverseLookup(lat, lng) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) return "";
    const data = await response.json();
    return cleanAddressString(data?.display_name || "");
  } catch {
    return "";
  }
}

async function locateCurrentPickup() {
  const token = runToken;
  emit({ busy: tripText("locating") });
  try {
    const position = await getPreciseCurrentPosition({ targetAccuracyMeters: 40, maxWaitMs: 9000 });
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const address = await reverseLookup(lat, lng);
    if (token !== runToken) return;
    setPickup({ lat, lng, name: tripText("currentLocation"), address: address || tripText("currentLocation") });
  } catch {
    if (token !== runToken) return;
    askPickup(tripText("locateFailed"));
  }
}

async function searchPickup(query) {
  const token = runToken;
  emit({ busy: tripText("searching") });
  const dropoff = state.data.dropoffPoint;
  const center = dropoff ? { lat: dropoff.lat, lng: dropoff.lng, countryCode: country().iso2 } : null;
  const places = await searchLocations(query, center, { limit: 5, countryCode: String(country().iso2 || "").toLowerCase() }).catch(() => []);
  if (token !== runToken) return;
  const options = places
    .map((place, index) => {
      const point = normalizeBookingLocationPoint(place);
      if (!point) return null;
      return { value: `found:${index}`, label: [place.name, place.address].filter(Boolean).join(" · ").slice(0, 80), place: point };
    })
    .filter(Boolean);
  if (!options.length) {
    askPickup(tripText("noPickupResults"));
    return;
  }
  ask("pickup", tripText("pickPickup"), { options, input: { type: "text", placeholder: tripText("pickupPlaceholder") } });
}

function setPickup(point) {
  setData({ pickup: point.name === tripText("currentLocation") ? getBookingLocationInputValue(point) : placeText(point), pickupPoint: point });
  if (state.data.mode === "delivery") {
    ask("package", tripText("askPackage"), { input: { type: "text", placeholder: tripText("packagePlaceholder") } });
    return;
  }
  // A bike seats one: nothing to ask.
  if (maxPassengers() <= 1) {
    setData({ passengers: "1" });
    askBillingOrWhen();
    return;
  }
  ask("passengers", tripText("askPassengers"), passengerQuestion());
}

function maxPassengers() {
  return maxPassengersForVehicle(state.data.fleetType);
}

function passengerQuestion() {
  const max = maxPassengers();
  // Typed numbers are accepted too and capped at what the vehicle seats.
  return {
    options: Array.from({ length: max }, (_, index) => ({ value: String(index + 1), label: String(index + 1) })),
    input: { type: "number", placeholder: String(max) },
  };
}

function askBillingOrWhen() {
  // Hourly booking exists only for a chosen operator's own form.
  if (state.data.kind === "operator" && Number(state.data.fleet?.pricePerHour || 0) > 0) {
    ask("billing", tripText("askBilling"), {
      options: [
        { value: "distance", label: tripText("byDistance") },
        { value: "time", label: tripText("byTime") },
      ],
    });
    return;
  }
  setData({ bookingMethod: "distance" });
  askWhen();
}

function askWhen() {
  ask("when", tripText("askWhen"), {
    options: [
      { value: "now", label: tripText("now") },
      { value: "later", label: tripText("later") },
    ],
  });
}

async function askContact() {
  const token = runToken;
  if (!state.data.contactLoaded) {
    const profile = await getOnboardingProfile().catch(() => null);
    if (token !== runToken) return;
    setData({
      contactLoaded: true,
      passengerName: String(profile?.displayName || profile?.fullName || profile?.full_name || "").trim(),
      phone: String(profile?.phone || profile?.phoneNumber || profile?.phone_number || "").trim(),
    });
  }
  const { passengerName, phone } = state.data;
  if (passengerName && phone && validateCountryPhone(phone).valid) {
    ask("contact", tripText("askContact", { name: passengerName, phone }), {
      options: [
        { value: "yes", label: tripText("yes") },
        { value: "change", label: tripText("change") },
      ],
    });
    return;
  }
  ask("name", tripText("askName"), { input: { type: "text", placeholder: tripText("namePlaceholder") } });
}

function askNote() {
  ask("note", tripText("askNote"), {
    options: [{ value: "__none", label: tripText("noNote") }],
    input: { type: "text", placeholder: tripText("notePlaceholder") },
  });
}

async function askFare() {
  const token = runToken;
  const { mode, fleetType, pickup, dropoff, pickupPoint, dropoffPoint } = state.data;
  emit({ busy: tripText("calculatingFare") });
  let offers = null;
  try {
    const route = await calculateBookingRoute(pickup, dropoff, { pickupPoint, destinationPoint: dropoffPoint }).catch(() => null);
    offers = await estimateOpenBookingFares({ mode, fleetType, distanceKm: route?.distanceKm || 0 });
  } catch {
    offers = null;
  }
  if (token !== runToken) return;
  setData({ offers });
  const currency = country().currency?.code || "";
  if (!offers) {
    askAmount(tripText("noPrices"));
    return;
  }
  ask("fare", tripText("askFare"), {
    options: [
      ...["economy", "average", "priority"].map((key) => ({
        value: key,
        label: `${tripText(key)} · ${formatCountryMoney(offers[key], currency)}`,
      })),
      { value: "custom", label: tripText("ownAmount") },
    ],
  });
}

function askAmount(prefix = "") {
  const currency = country().currency?.code || "";
  const text = [prefix, tripText("askAmount", { currency })].filter(Boolean).join(" ");
  ask("amount", text, { input: { type: "number", placeholder: tripText("amountPlaceholder") } });
}

// --- summary and hand-off ------------------------------------------------------

export function tripSummaryRows(data = state.data) {
  const currency = country().currency?.code || "";
  const rows = [];
  if (data.kind === "operator" && data.fleet) {
    rows.push([tripText("rowOperator"), `${data.fleet.operatorName || data.fleet.fleetName} (${data.fleet.operatorId || ""})`]);
  }
  rows.push([tripText("rowVehicle"), data.vehicleLabel || ""]);
  rows.push([tripText("rowPickup"), data.pickup || ""]);
  rows.push([tripText("rowDropoff"), data.dropoff || data.dropoffName || ""]);
  if (data.mode === "delivery") rows.push([tripText("rowPackage"), data.packageDescription || ""]);
  else rows.push([tripText("rowPassengers"), data.passengers || "1"]);
  if (data.kind === "operator") {
    rows.push([tripText("rowBilling"), data.bookingMethod === "time" ? `${tripText("byTime")} · ${tripText("hoursValue", { n: data.bookedHours })}` : tripText("byDistance")]);
  }
  rows.push([
    tripText("rowWhen"),
    data.pickupTime === "schedule" && data.scheduledAt
      ? new Date(data.scheduledAt).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : tripText("now"),
  ]);
  rows.push([tripText("rowContact"), [data.passengerName, data.phone].filter(Boolean).join(" · ")]);
  if (data.note) rows.push([tripText("rowNote"), data.note]);
  if (data.kind === "open" && data.offerAmount > 0) rows.push([tripText("rowFare"), formatCountryMoney(data.offerAmount, currency)]);
  return rows.filter(([, value]) => value);
}

function showSummary() {
  ask("summary", tripText("summaryHint"), {
    card: { type: "summary", rows: tripSummaryRows() },
    options: [
      { value: "review", label: tripText("review") },
      { value: "restart", label: tripText("startOver") },
    ],
  });
}

/** The booking form's own field names, filled from the answers. */
export function buildTripBookingDraft(data = state.data) {
  const form = {
    pickup: data.pickup || "",
    pickupPoint: data.pickupPoint || null,
    dropoff: data.dropoff || "",
    dropoffPoint: data.dropoffPoint || null,
    passengerName: data.passengerName || "",
    phone: data.phone || "",
    pickupTime: data.pickupTime === "schedule" ? "schedule" : "now",
    scheduledAt: data.pickupTime === "schedule" ? data.scheduledAt || "" : "",
    passengers: data.mode === "delivery" ? "1" : String(data.passengers || "1"),
    packageDescription: data.mode === "delivery" ? data.packageDescription || "" : "",
    note: data.note || "",
  };
  if (data.kind === "operator") {
    return {
      kind: "operator",
      fleet: data.fleet,
      draftForm: { ...form, bookingMethod: data.bookingMethod === "time" ? "time" : "distance", bookedHours: String(data.bookedHours || "1") },
    };
  }
  return {
    kind: "open",
    draft: {
      mode: data.mode === "delivery" ? "delivery" : "ride",
      fleetType: data.fleetType || "",
      form,
      offerChoice: data.offerChoice || "average",
      customAmount: data.offerChoice === "custom" ? String(data.customAmount || "") : "",
    },
  };
}

let handOffListener = null;
/** The chat panel closes itself when the filled form opens. */
export function onTripHandOff(listener) {
  handOffListener = listener;
  return () => {
    if (handOffListener === listener) handOffListener = null;
  };
}

function handOff() {
  openKaiTripBooking(buildTripBookingDraft());
  say(tripText("opened"));
  emit({ active: false, question: null });
  handOffListener?.();
}
