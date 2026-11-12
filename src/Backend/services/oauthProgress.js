// "The provider has answered; KunThai is now finishing the sign-in."
//
// Google / Facebook / Apple hand control back to the app a few seconds before
// the session exists (the code or token still has to be exchanged). Login
// listens for this event and covers its form with "Signing you in..." for
// that gap, so sign-in never looks like it bounced back to the login screen.
// Payload: { active: boolean }. active:false releases the cover (for example
// when the browser sign-in has to run instead).
export const OAUTH_RETURNING_EVENT = "kuntai-oauth-returning";

export function emitOAuthReturning(active = true) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OAUTH_RETURNING_EVENT, { detail: { active } }));
}
