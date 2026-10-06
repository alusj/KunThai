// Pure rules for email account recovery (no Supabase import, so they can be
// unit tested). See emailRecoveryService.js for the flow.

// A sign-in link requested from Login; the set-new-password step only opens
// for a session that arrives within this window.
export const EMAIL_RECOVERY_WINDOW_MS = 60 * 60 * 1000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeRecoveryEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function isValidRecoveryEmail(value) {
  return EMAIL_PATTERN.test(normalizeRecoveryEmail(value));
}

// Where the account's recovery email stands. Only an email confirmed as the
// account's sign-in email can receive a recovery link:
//   verified    – auth email set and confirmed
//   pending     – a confirmation link is waiting in the inbox
//   unconfirmed – an email was saved on the profile but never confirmed
//   none        – no email at all
export function recoveryEmailStatus(user) {
  if (!user) return { status: "none", email: "" };
  const authEmail = normalizeRecoveryEmail(user.email);
  const pendingEmail = normalizeRecoveryEmail(user.new_email);
  const contactEmail = normalizeRecoveryEmail(user.user_metadata?.contact_email);

  if (pendingEmail) return { status: "pending", email: pendingEmail };
  if (authEmail && user.email_confirmed_at) return { status: "verified", email: authEmail };
  if (authEmail) return { status: "pending", email: authEmail };
  if (contactEmail) return { status: "unconfirmed", email: contactEmail };
  return { status: "none", email: "" };
}

// Supabase answers an unknown or unconfirmed email with an error. Telling the
// person that would reveal which emails have KunThai accounts, so those cases
// look exactly like a sent link. Only rate limits and connection problems are
// worth reporting.
export function classifyRecoveryLinkError(error) {
  if (!error) return "sent";
  const code = String(error.code || "").toLowerCase();
  const message = String(error.message || "").toLowerCase();
  const status = Number(error.status) || 0;

  if (status === 429 || code.includes("rate_limit") || /rate limit|too many|for security purposes/.test(message)) {
    return "rate_limited";
  }
  if (/fetch|network|timed? ?out|offline/.test(message) || code === "network_error") {
    return "network";
  }
  return "sent";
}

export function isRecoveryFlagFresh(flag, now = Date.now()) {
  if (!flag || typeof flag !== "object") return false;
  const at = Number(flag.at);
  if (!Number.isFinite(at)) return false;
  return now - at >= 0 && now - at <= EMAIL_RECOVERY_WINDOW_MS;
}

// Reads the `amr` claim of a Supabase access token: the sign-in methods of
// this session. Returns [] when the token cannot be read.
export function sessionSignInMethods(accessToken) {
  try {
    const payload = String(accessToken || "").split(".")[1];
    if (!payload) return [];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded));
    return Array.isArray(claims.amr) ? claims.amr.map((entry) => String(entry?.method || entry || "")) : [];
  } catch {
    return [];
  }
}

// The set-new-password step opens only for the account the link was asked
// for, when this session really came from an email link or code (not from a
// later phone + password sign-in).
export function shouldOfferRecoveryPassword({ flag, user, accessToken, now = Date.now() }) {
  if (!isRecoveryFlagFresh(flag, now) || !user) return false;
  if (normalizeRecoveryEmail(user.email) !== normalizeRecoveryEmail(flag.email)) return false;
  const methods = sessionSignInMethods(accessToken);
  if (!methods.length) return true;
  return methods.some((method) => ["otp", "magiclink", "email", "email/signup"].includes(method));
}
