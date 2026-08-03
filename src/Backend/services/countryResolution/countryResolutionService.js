// Shared country-resolution service (browser adapter).
//
// THE one place UrRide decides "which country is the user operating in right
// now". Every surface — nearby operators, fleets, companies, vehicle listings,
// dispatch results and the emergency card — reads from here so the app can
// never hold two conflicting country answers at once.
//
// It gathers the raw signals (a live GPS fix + reverse geocode, a session-level
// border confirmation, the account profile country, an optional IP guess),
// hands them to the PURE resolvers, and exposes both an imperative API and a
// React store. All network / geolocation / storage lives here; the decision
// logic lives in resolveOperationalCountry + countryBoundary and stays testable.

import { useSyncExternalStore } from "react";

import { normalizeCoordinates } from "../../utils/coordinates.js";
import { normalizeGeocodeAddress } from "../../utils/geoAddress.js";
import { lookupCountryIso } from "../../utils/detectCountry.js";
import {
  getCountryProfile,
  normalizeCountryIso,
  storeCountryContext,
} from "../../../data/globalCountryProfiles.js";
import { resolveCountryFromReading } from "./countryBoundary.js";
import {
  resolveOperationalCountry,
  UNKNOWN_OPERATIONAL_COUNTRY,
} from "./resolveOperationalCountry.js";

const CONFIRMATION_KEY = "kunthai.borderCountryConfirmation.v1";
const READING_CACHE_KEY = "kunthai.operationalCountryReading.v1";
const CONFIDENT_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

// Swap the country lookup out in tests / offline builds.
let countryLookup = lookupCountryIso;
export function setCountryLookup(fn) {
  countryLookup = typeof fn === "function" ? fn : lookupCountryIso;
}

function readJson(storage, key) {
  try {
    return JSON.parse(storage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function writeJson(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be blocked (private mode / WKWebView); non-fatal.
  }
}

// --- session-level border confirmation ------------------------------------
// Per spec: a manual border confirmation is TEMPORARY (session scope) and must
// never overwrite the user's saved account country.
export function readBorderConfirmation() {
  if (typeof window === "undefined") return null;
  const stored = readJson(window.sessionStorage, CONFIRMATION_KEY);
  const iso = normalizeCountryIso(stored?.countryCode);
  return iso ? { ...stored, countryCode: iso } : null;
}

export function confirmBorderCountry(countryCode, coords = null) {
  const iso = normalizeCountryIso(countryCode);
  if (!iso || typeof window === "undefined") return null;
  const normalizedCoords = normalizeCoordinates(coords);
  const record = { countryCode: iso, ts: Date.now(), ...(normalizedCoords || {}) };
  writeJson(window.sessionStorage, CONFIRMATION_KEY, record);
  return record;
}

export function clearBorderConfirmation() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(CONFIRMATION_KEY);
  } catch {
    // ignore
  }
}

function readCachedReading() {
  if (typeof window === "undefined") return null;
  const cached = readJson(window.localStorage, READING_CACHE_KEY);
  if (!cached || !normalizeCountryIso(cached.countryCode)) return null;
  if (!cached.ts || Date.now() - cached.ts > CONFIDENT_MAX_AGE_MS) return null;
  return cached;
}

function cacheReading(reading) {
  if (typeof window === "undefined" || !reading) return;
  writeJson(window.localStorage, READING_CACHE_KEY, { ...reading, ts: Date.now() });
}

// --- reverse geocode for structured address parts -------------------------
async function reverseGeocodeAddress(latitude, longitude) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=12&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) return {};
    const data = await response.json();
    return normalizeGeocodeAddress(data?.address || {}, { latitude, longitude });
  } catch {
    return {};
  }
}

function getCurrentPosition() {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  });
}

// Build a GPS reading (country + border-uncertainty + address parts) from a
// live position, or null when unavailable.
async function buildLiveReading(position) {
  const coords = normalizeCoordinates({
    latitude: position?.coords?.latitude,
    longitude: position?.coords?.longitude,
  });
  if (!coords) return null;

  const accuracyMeters = Number(position.coords.accuracy);
  const boundary = await resolveCountryFromReading(
    { ...coords, accuracyMeters },
    countryLookup,
  );
  if (!boundary) return null;

  const address = await reverseGeocodeAddress(coords.latitude, coords.longitude);
  const confirmation = readBorderConfirmation();

  return {
    ...boundary,
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracyMeters: Number.isFinite(accuracyMeters) ? accuracyMeters : null,
    region: address.region || "",
    district: address.district || address.city || "",
    city: address.city || "",
    confirmedCountryCode: confirmation?.countryCode || "",
  };
}

// Resolve the operational country from all available signals. `profileCountry`
// and `ipCountry` are supplied by the caller (account context / edge headers);
// `planning` carries an explicit planning-mode selection.
export async function resolveCurrentCountry({
  profileCountry = "",
  ipCountry = "",
  planning = null,
  position = undefined,
} = {}) {
  const livePosition = position === undefined ? await getCurrentPosition() : position;
  const liveReading = livePosition ? await buildLiveReading(livePosition) : null;

  if (liveReading && !liveReading.isBorderUncertain) {
    cacheReading(liveReading);
  }

  const confirmedReading = liveReading ? null : readCachedReading();
  const manualConfirmation = liveReading ? null : readBorderConfirmation();

  const result = resolveOperationalCountry({
    liveReading,
    confirmedReading,
    manualConfirmation,
    planningActive: Boolean(planning?.active),
    planningCountry: planning?.country || null,
    profileCountry,
    ipCountry,
  });

  // Keep the lightweight global country context (used by currency/phone
  // formatting) in sync ONLY when we have a confident physical fix — never from
  // a weak fallback, and never a border-uncertain guess.
  if (result.countryCode && !result.requiresConfirmation && result.source === "gps") {
    storeCountryContext(result.countryCode);
  }

  return result;
}

// --- React store ----------------------------------------------------------
let state = { status: "idle", result: UNKNOWN_OPERATIONAL_COUNTRY };
let inFlight = false;
const listeners = new Set();

function emit(next) {
  state = next;
  listeners.forEach((listener) => listener());
}

export async function ensureOperationalCountry(options = {}) {
  if (inFlight) return state.result;
  inFlight = true;
  emit({ status: "loading", result: state.result });
  try {
    const result = await resolveCurrentCountry(options);
    emit({ status: "ready", result });
    return result;
  } catch {
    emit({ status: "error", result: state.result });
    return state.result;
  } finally {
    inFlight = false;
  }
}

// Record a border confirmation and immediately re-resolve.
export async function applyBorderConfirmation(countryCode, options = {}) {
  confirmBorderCountry(countryCode, options.coords || null);
  return ensureOperationalCountry(options);
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function useOperationalCountry() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function countryDisplayName(countryCode) {
  return getCountryProfile(countryCode)?.name || "";
}
