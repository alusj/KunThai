// Account recovery by email, for people who can no longer receive codes on
// their phone number.
//
// 1. The account's email must be confirmed first (profile or Settings →
//    Security). Supabase only sends sign-in links to a confirmed account email;
//    an email saved on the profile alone cannot receive one.
// 2. Login → "Can't access your phone?" sends a one-time sign-in link (and a
//    code, when the email template includes it) with shouldCreateUser: false,
//    so it never creates an account.
// 3. The link signs the person in. App then offers a new password, so from
//    then on phone number + password works again without any SMS.

import supabase from "../lib/supabaseClient";
import { checkKunThaiIdentityAvailability, EMAIL_ALREADY_LINKED_CODE, EMAIL_ALREADY_LINKED_MESSAGE } from "./accountIdentityService";
import { resolveOAuthRedirect } from "./nativeOAuthService";
import {
  classifyRecoveryLinkError,
  isValidRecoveryEmail,
  normalizeRecoveryEmail,
  recoveryEmailStatus,
  shouldOfferRecoveryPassword,
} from "./emailRecoveryRules";

const RECOVERY_FLAG_KEY = "kt_email_recovery_pending";

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function readEmailRecoveryFlag() {
  try {
    const raw = window.localStorage.getItem(RECOVERY_FLAG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeEmailRecoveryFlag(email) {
  try {
    window.localStorage.setItem(RECOVERY_FLAG_KEY, JSON.stringify({ email, at: Date.now() }));
  } catch {
    // Without storage the person can still change the password in Settings.
  }
}

export function clearEmailRecoveryFlag() {
  try {
    window.localStorage.removeItem(RECOVERY_FLAG_KEY);
  } catch {
    // Nothing to clear.
  }
}

// Sends the sign-in link. Resolves the same way whether or not the email has
// an account, so the screen cannot be used to discover who uses KunThai.
export async function sendEmailRecoveryLink(email) {
  const normalized = normalizeRecoveryEmail(email);
  if (!isValidRecoveryEmail(normalized)) {
    throw codedError("invalid_email", "Enter a valid email address.");
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: { shouldCreateUser: false, emailRedirectTo: resolveOAuthRedirect() },
  });

  const outcome = classifyRecoveryLinkError(error);
  if (outcome === "rate_limited") {
    throw codedError("rate_limited", "Too many requests. Please wait a few minutes and try again.");
  }
  if (outcome === "network") {
    throw codedError("network", "Check your internet connection and try again.");
  }

  writeEmailRecoveryFlag(normalized);
  return normalized;
}

// For a link opened on another device: the email can also carry a code.
export async function verifyEmailRecoveryCode(email, code) {
  const { error } = await supabase.auth.verifyOtp({
    email: normalizeRecoveryEmail(email),
    token: String(code || "").trim(),
    type: "email",
  });
  if (error) {
    throw codedError("invalid_code", "This code is wrong or has expired. Request a new email.");
  }
}

export async function shouldShowRecoveryPasswordStep() {
  const flag = readEmailRecoveryFlag();
  if (!flag) return false;
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  const offer = shouldOfferRecoveryPassword({ flag, user: session?.user, accessToken: session?.access_token });
  // A stale flag, or one for another account, is not needed any more.
  if (!offer && session?.user) clearEmailRecoveryFlag();
  return offer;
}

export async function getRecoveryEmailState() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return { status: "none", email: "" };
  return recoveryEmailStatus(data.user);
}

// Adds (or changes) the recovery email and sends the confirmation link.
// Returns the new status.
export async function requestRecoveryEmailConfirmation(email) {
  const normalized = normalizeRecoveryEmail(email);
  if (!isValidRecoveryEmail(normalized)) {
    throw codedError("invalid_email", "Enter a valid email address.");
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;
  if (userError || !user) throw codedError("no_session", "Sign in again to continue.");

  const current = recoveryEmailStatus(user);
  if (current.status === "verified" && current.email === normalized) return current;

  // Another account may already use this email (this account is excluded).
  await checkKunThaiIdentityAvailability({ email: normalized });

  const { data, error } = await supabase.auth.updateUser({
    email: normalized,
    data: { contact_email: normalized },
  });

  if (error) {
    if (error.code === "email_exists" || /already (been )?registered|already exists|error updating user/i.test(error.message || "")) {
      throw codedError(EMAIL_ALREADY_LINKED_CODE, EMAIL_ALREADY_LINKED_MESSAGE);
    }
    if (classifyRecoveryLinkError(error) === "rate_limited") {
      throw codedError("rate_limited", "Too many requests. Please wait a few minutes and try again.");
    }
    throw error;
  }

  // Keep the profile's contact email in step (best effort; the auth record is
  // what recovery uses).
  try {
    await supabase.from("explore_profiles").update({ contact_email: normalized }).eq("user_id", user.id);
  } catch {
    // The profile shows the auth metadata email anyway.
  }

  const next = recoveryEmailStatus(data?.user || user);
  // With email confirmation turned off the change applies at once.
  return next.status === "none" || next.status === "unconfirmed" ? { status: "pending", email: normalized } : next;
}
