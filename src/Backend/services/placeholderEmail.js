// Sign-in placeholder addresses.
//
// A Facebook account whose Facebook shares no email has no address KunThai's
// sign-in service can open a session through, so the facebook-native-signin
// edge function gives it an internal one: fb_<facebook id>@kunthai.invalid
// (".invalid" can never receive mail). It exists only for that server step.
// Everywhere in the app such an account is treated exactly as before: an
// account with no email. hidePlaceholderEmail() is applied where the signed-in
// user enters the app (supabaseClient.js, useAuth.js), so screens and services
// never see the address.

export const PLACEHOLDER_EMAIL_DOMAIN = "kunthai.invalid";

export function isPlaceholderEmail(email) {
  return String(email || "").trim().toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

// The address to show or use, or "" for a placeholder.
export function visibleEmail(email) {
  return isPlaceholderEmail(email) ? "" : String(email || "");
}

// Clears a placeholder address from a Supabase user object, in place, so it
// reads as the email-less account it is. Returns the same object.
export function hidePlaceholderEmail(user) {
  if (!user || typeof user !== "object") return user;
  if (isPlaceholderEmail(user.email)) {
    user.email = "";
    user.email_confirmed_at = null;
  }
  if (isPlaceholderEmail(user.new_email)) user.new_email = "";
  if (user.user_metadata && isPlaceholderEmail(user.user_metadata.email)) {
    user.user_metadata = { ...user.user_metadata, email: "" };
  }
  if (Array.isArray(user.identities)) {
    user.identities = user.identities.filter((identity) => !(
      identity?.provider === "email" && isPlaceholderEmail(identity?.identity_data?.email || identity?.email)
    ));
  }
  return user;
}
