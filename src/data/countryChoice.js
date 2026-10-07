// The country a person picks by hand in Settings (UrMall / UrRide / Explore)
// versus the country KunThai detects from where the phone is.
//
// A hand-picked country is kept: GPS and other background detection no longer
// replace it. It lasts until KunThai has been unused for a while
// (COUNTRY_CHOICE_IDLE_RESET_MS); on the next open the app goes back to the
// country the person is actually in.
//
// No imports from globalCountryProfiles.js, which imports this module.

export const COUNTRY_CHOICE_KEY = "kunthai.countryChoice.v1";
export const DETECTED_COUNTRY_KEY = "kunthai.detectedCountry.v1";
export const LAST_ACTIVE_KEY = "kunthai.lastActiveAt.v1";

// "Inactive for a while": no use of the app for this long.
export const COUNTRY_CHOICE_IDLE_RESET_MS = 6 * 60 * 60 * 1000;
// A detected country older than this is no longer a reliable "where you are".
export const DETECTED_COUNTRY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function cleanIso(value) {
  const iso = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(iso) ? iso : "";
}

function storage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readJson(key) {
  try {
    const raw = storage()?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    if (value == null) storage()?.removeItem(key);
    else storage()?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is a convenience; the app still works without it.
  }
}

// --- Pure rules (unit tested) ------------------------------------------------

// The hand-picked country is dropped when the app comes back after being
// unused for longer than the idle limit.
export function shouldResetCountryChoice({ choice, lastActiveAt, now = Date.now(), idleMs = COUNTRY_CHOICE_IDLE_RESET_MS } = {}) {
  if (!cleanIso(choice?.iso2)) return false;
  const last = Number(lastActiveAt);
  if (!Number.isFinite(last) || last <= 0) return false;
  return now - last > idleMs;
}

// The country to go back to: the last detected country when it is recent,
// otherwise the phone's time-zone country.
export function pickLegalCountry({ detected, timeZoneIso = "", now = Date.now() } = {}) {
  const detectedIso = cleanIso(detected?.iso2);
  const fresh = detectedIso && Number.isFinite(Number(detected?.at)) && now - Number(detected.at) <= DETECTED_COUNTRY_MAX_AGE_MS;
  return fresh ? detectedIso : cleanIso(timeZoneIso);
}

// --- Storage -----------------------------------------------------------------

export function readCountryChoice() {
  const choice = readJson(COUNTRY_CHOICE_KEY);
  return cleanIso(choice?.iso2) ? { iso2: cleanIso(choice.iso2), at: Number(choice.at) || 0 } : null;
}

export function rememberCountryChoice(iso2, now = Date.now()) {
  const iso = cleanIso(iso2);
  if (iso) writeJson(COUNTRY_CHOICE_KEY, { iso2: iso, at: now });
}

export function clearCountryChoice() {
  writeJson(COUNTRY_CHOICE_KEY, null);
}

export function hasCountryChoice() {
  return Boolean(readCountryChoice());
}

export function readDetectedCountry() {
  const detected = readJson(DETECTED_COUNTRY_KEY);
  return cleanIso(detected?.iso2) ? { iso2: cleanIso(detected.iso2), at: Number(detected.at) || 0 } : null;
}

export function rememberDetectedCountry(iso2, now = Date.now()) {
  const iso = cleanIso(iso2);
  if (iso) writeJson(DETECTED_COUNTRY_KEY, { iso2: iso, at: now });
}

export function readLastActiveAt() {
  try {
    return Number(storage()?.getItem(LAST_ACTIVE_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function touchLastActive(now = Date.now()) {
  try {
    storage()?.setItem(LAST_ACTIVE_KEY, String(now));
  } catch {
    // Without storage the choice simply never expires on this device.
  }
}
