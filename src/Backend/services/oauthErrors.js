// Turns what Supabase Auth / the provider sends back after a social sign-in
// failure into a message a person can act on. Shared by the web return
// (oauthReturnService) and the native deep-link handler (nativeOAuthService).

const PROVIDER_NAMES = { google: "Google", facebook: "Facebook", apple: "Apple" };

export function providerDisplayName(provider) {
  return PROVIDER_NAMES[String(provider || "").toLowerCase()] || "";
}

export function describeOAuthFailure({ error = "", code = "", description = "", provider = "" } = {}) {
  const name = providerDisplayName(provider);
  const via = name ? ` with ${name}` : "";
  const value = `${error} ${code} ${description}`.toLowerCase();

  if (value.includes("access_denied") || value.includes("cancel") || value.includes("denied")) {
    return "Sign-in was cancelled or permission was declined.";
  }
  if (value.includes("not enabled")) {
    return "This sign-in method is not enabled. Please try another option.";
  }
  // Provider account has no (shared) email address.
  if (value.includes("error getting user email")) {
    return `${name || "The provider"} did not share your email. Try again and allow email access, or sign up with your phone number.`;
  }
  // New auth user rejected by the database: KunThai keeps one account per
  // email/phone, so the provider's email already belongs to another account.
  if (value.includes("database error saving new user") || value.includes("database error")) {
    return `The email on this ${name || "social"} account is already used by another KunThai account. Sign in to that account with your phone or email instead.`;
  }
  if (value.includes("already linked") || value.includes("identity is already") || value.includes("already registered")) {
    return "This social account is already connected to another KunThai account.";
  }
  if (value.includes("manual linking") || value.includes("linking is disabled")) {
    return "Account linking is turned off for KunThai. Please contact support.";
  }
  // PKCE: the sign-in ended in a different browser/app context than the one
  // that started it (e.g. an iPhone home-screen app vs Safari), so the saved
  // verifier is missing, or the code was already used or expired.
  if (
    value.includes("code verifier") ||
    value.includes("code_verifier") ||
    value.includes("flow state") ||
    value.includes("flow_state") ||
    value.includes("invalid_grant") ||
    value.includes("auth code")
  ) {
    return `Sign-in${via} finished in a different window than it started. Please try again; on iPhone, use Safari or the KunThai app.`;
  }
  if (value.includes("network") || value.includes("fetch")) {
    return "Network problem completing sign-in. Check your connection and try again.";
  }
  return description || `We couldn't finish signing you in${via}. Please try again.`;
}
