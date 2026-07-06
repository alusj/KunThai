import supabase from "../lib/supabaseClient";

const GUEST_KEY = "kuntai-guest-mode";
const AUTH_INTENT_KEY = "kuntai-auth-intent";

export const GUEST_MODE_CHANGED_EVENT = "kuntai-guest-changed";
export const GUEST_GATE_EVENT = "kuntai-guest-gate";

export function isGuestMode() {
  try {
    return sessionStorage.getItem(GUEST_KEY) === "1";
  } catch {
    return false;
  }
}

// Guests browse through a Supabase anonymous session: no name, phone, email,
// or profile is collected, and the visitor record is deleted again when the
// guest leaves or moves to account creation.
export async function enterGuestMode() {
  const { error } = await supabase.auth.signInAnonymously();

  if (error) {
    throw new Error("KunThai could not start a guest visit right now. Please try again.");
  }

  try {
    sessionStorage.setItem(GUEST_KEY, "1");
  } catch {
    // Guest mode still works for this page view without storage.
  }
  window.dispatchEvent(new Event(GUEST_MODE_CHANGED_EVENT));
}

export async function endGuestVisit({ intent = "" } = {}) {
  try {
    // Remove the anonymous visitor account so no guest data stays behind.
    await supabase.rpc("delete_kunthai_account");
  } catch {
    // A failed cleanup only leaves an empty anonymous row; sign-out proceeds.
  }

  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // The local session is cleared below either way.
  }

  try {
    sessionStorage.removeItem(GUEST_KEY);
    if (intent) sessionStorage.setItem(AUTH_INTENT_KEY, intent);
  } catch {
    // Storage unavailability only loses the signup shortcut.
  }
  window.dispatchEvent(new Event(GUEST_MODE_CHANGED_EVENT));
}

export function consumeAuthIntent() {
  try {
    const intent = sessionStorage.getItem(AUTH_INTENT_KEY) || "";
    sessionStorage.removeItem(AUTH_INTENT_KEY);
    return intent;
  } catch {
    return "";
  }
}

// Returns true (and raises the floating gate card) when the current visitor
// is a guest and the action must be blocked.
export function guardGuestAction(reaction = "react", target = "post") {
  if (!isGuestMode()) return false;

  window.dispatchEvent(new CustomEvent(GUEST_GATE_EVENT, { detail: { reaction, target } }));
  return true;
}
