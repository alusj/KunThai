// Where the passenger is, for "near you" lists. Never surprises anyone with a
// permission prompt: it only asks when `prompt` is true (the passenger tapped
// "Use my location"). Otherwise it uses GPS only when permission was already
// given, then the cached device location, then nothing.

import { ensureBuyerLocation, readCachedBuyerLocation } from "../../Backend/utils/buyerLocationContext";

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

function currentPosition() {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => resolve(null),
      // A position up to two minutes old is fine for ranking nearby operators.
      { enableHighAccuracy: false, maximumAge: 120_000, timeout: 10_000 },
    );
  });
}

// Resolves { latitude, longitude, place, source: "device" | "cached" } or null.
export async function getPassengerPosition({ prompt = false } = {}) {
  const cached = readCachedBuyerLocation();
  const place = cached?.community || cached?.city || "";

  if (typeof navigator !== "undefined" && navigator.geolocation && (prompt || (await permissionAlreadyGranted()))) {
    const position = await currentPosition();
    if (position) {
      rememberGranted();
      // Refreshes the shared city label in the background (no prompt).
      ensureBuyerLocation().catch(() => {});
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
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
