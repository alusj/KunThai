// Where the passenger is, for "near you" lists. Never surprises anyone with a
// permission prompt: it only asks when `prompt` is true (the passenger tapped
// "Use my location"). Otherwise it uses GPS only when permission was already
// given, then the cached device location, then nothing.

import { ensureBuyerLocation, readCachedBuyerLocation } from "../../Backend/utils/buyerLocationContext";
import { getPreciseCurrentPosition } from "../../Backend/utils/precisePosition";

const GRANTED_KEY = "kunthai.locationGranted.v1";

function rememberGranted() {
  try {
    localStorage.setItem(GRANTED_KEY, "1");
  } catch {
    // Storage can be unavailable; the passenger can tap the button again.
  }
}

async function permissionAlreadyGranted() {
  try {
    if (localStorage.getItem(GRANTED_KEY) === "1") return true;
  } catch {
    // Fall through to the Permissions API.
  }
  try {
    const status = await navigator.permissions?.query?.({ name: "geolocation" });
    return status?.state === "granted";
  } catch {
    return false;
  }
}

function roughPosition() {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 120_000, timeout: 10_000 },
    );
  });
}

// "250 m away" is only right with a GPS fix: a quick network fix can be 1-2 km
// off. So the best GPS reading within a few seconds is used (longer when the
// passenger tapped Refresh), and the old quick read only when GPS gives nothing.
async function currentPosition({ fresh = false } = {}) {
  try {
    return await getPreciseCurrentPosition({
      targetAccuracyMeters: fresh ? 25 : 50,
      maxWaitMs: fresh ? 8000 : 4000,
    });
  } catch (error) {
    if (error?.code === 1) return null;
    return roughPosition();
  }
}

// Resolves { latitude, longitude, accuracy, place, source: "device" | "cached" }
// or null. `fresh`: the passenger asked for an up-to-date position (Refresh).
export async function getPassengerPosition({ prompt = false, fresh = false } = {}) {
  const cached = readCachedBuyerLocation();
  const place = cached?.community || cached?.city || "";

  if (typeof navigator !== "undefined" && navigator.geolocation && (prompt || (await permissionAlreadyGranted()))) {
    const position = await currentPosition({ fresh });
    if (position) {
      rememberGranted();
      // Refreshes the shared city label in the background (no prompt).
      ensureBuyerLocation().catch(() => {});
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        place,
        source: "device",
      };
    }
  }

  if (cached) {
    return { latitude: Number(cached.latitude), longitude: Number(cached.longitude), place, source: "cached" };
  }
  return null;
}
