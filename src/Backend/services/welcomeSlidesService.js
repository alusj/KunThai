// The welcome slides (Explore, UrMall, UrRide) show once per install, before
// the first sign-in. Finishing or skipping them, or any sign-in on this
// device, sets the flag so they never show again (reinstalling clears it).
import { isLikelySignedIn } from "./startupSession.js";

export const WELCOME_SEEN_KEY = "kunthai.welcomeSeen.v1";

export function hasSeenWelcome(storage) {
  try {
    return Boolean(storage?.getItem(WELCOME_SEEN_KEY));
  } catch {
    // Storage blocked: never trap the user in front of the sign-in screen.
    return true;
  }
}

export function markWelcomeSeen(storage) {
  try {
    storage?.setItem(WELCOME_SEEN_KEY, "1");
  } catch {
    // Storage blocked: the slides may show again next launch; nothing breaks.
  }
}

// Shown only on a fresh install: no flag, no saved sign-in, and not opened
// from a sign-in link (Google / Apple / email return).
export function shouldShowWelcome({ storage, location } = {}) {
  if (!storage) return false;
  if (hasSeenWelcome(storage)) return false;
  return !isLikelySignedIn({ storage, location });
}
