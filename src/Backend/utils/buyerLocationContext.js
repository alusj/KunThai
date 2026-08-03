// Buyer location context for context-aware product-card addresses.
//
// Resolves the buyer's current CITY (not just coordinates) once per session and
// caches it, so product cards can decide whether the buyer and seller are in the
// same city. It is deliberately privacy-conservative:
//   - never triggers a fresh geolocation permission prompt just to label cards
//     (only resolves when permission is already granted, or a cache exists);
//   - falls back to null (cards then show the seller's city + country).
//
// This is read-only context; it never writes to any seller/product record.

import { useSyncExternalStore } from "react";

import { normalizeGeocodeAddress } from "./geoAddress.js";
import { normalizeCoordinates } from "./coordinates.js";
import { haversineKm } from "./distance.js";

const CACHE_KEY = "kunthai.buyerLocation.v1";
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours
const MOVE_THRESHOLD_KM = 3;

function readCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    return parsed && parsed.latitude != null && parsed.longitude != null ? parsed : null;
  } catch {
    return null;
  }
}

// state.location is a normalized structured buyerLocation (or null).
let state = { status: "idle", location: readCache() };
let inFlight = false;
const listeners = new Set();

function emit(next) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

async function reverseGeocodeCity(latitude, longitude) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=12&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) return null;
    const data = await response.json();
    const normalized = normalizeGeocodeAddress(data?.address || {}, { latitude, longitude });
    if (!normalized.city && !normalized.region && !normalized.country) return null;
    return {
      community: normalized.community,
      city: normalized.city,
      region: normalized.region,
      country: normalized.country,
      latitude,
      longitude,
    };
  } catch {
    return null;
  }
}

async function shouldAutoResolve() {
  if (typeof navigator === "undefined" || !navigator.geolocation) return false;
  // When the Permissions API is available, only resolve on an already-granted
  // permission — never provoke a prompt just to label cards.
  if (navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({ name: "geolocation" });
      return status.state === "granted";
    } catch {
      return false;
    }
  }
  // No Permissions API (e.g. iOS WKWebView): only proceed if we already have a
  // cached fix to refresh, so we never introduce a new prompt here.
  return Boolean(state.location);
}

function getCurrentPosition() {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 600000, timeout: 8000 },
    );
  });
}

// Idempotent: safe to call from multiple mount points; only one resolution runs.
export async function ensureBuyerLocation() {
  if (inFlight || state.status === "loading") return;
  const cached = state.location;
  if (cached && cached.ts && Date.now() - cached.ts < MAX_AGE_MS) {
    if (state.status === "idle") emit({ status: "ready", location: cached });
    // Fresh enough; don't re-hit the network.
    return;
  }
  if (!(await shouldAutoResolve())) return;

  inFlight = true;
  emit({ status: "loading", location: state.location });

  const position = await getCurrentPosition();
  if (!position) {
    inFlight = false;
    emit({ status: "error", location: state.location });
    return;
  }

  const coords = normalizeCoordinates({
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  });
  if (!coords) {
    inFlight = false;
    emit({ status: "error", location: state.location });
    return;
  }

  // If we already have a recent city and the buyer hasn't moved cities, keep it.
  const previous = state.location;
  if (
    previous &&
    previous.ts &&
    Date.now() - previous.ts < MAX_AGE_MS &&
    Number.isFinite(haversineKm(previous, coords)) &&
    haversineKm(previous, coords) < MOVE_THRESHOLD_KM
  ) {
    inFlight = false;
    emit({ status: "ready", location: previous });
    return;
  }

  const geo = await reverseGeocodeCity(coords.latitude, coords.longitude);
  inFlight = false;
  if (!geo) {
    emit({ status: "error", location: previous });
    return;
  }
  const location = { ...geo, ts: Date.now() };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(location));
  } catch {
    // Private-mode storage failures are non-fatal.
  }
  emit({ status: "ready", location });
}

// Read-only hook for cards. Returns the normalized buyerLocation or null.
export function useBuyerLocation() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).location;
}
