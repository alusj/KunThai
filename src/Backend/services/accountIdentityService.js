import supabase from "../lib/supabaseClient";
import { getActiveCountryProfile } from "../../data/globalCountryProfiles";

export const PHONE_ALREADY_LINKED_CODE = "phone_exists";
export const PHONE_ALREADY_LINKED_MESSAGE =
  "This phone number is already linked to an existing KunThai account.";

const IDENTITY_UNAVAILABLE_MESSAGE =
  "We could not create an account with these details. Sign in or try another number.";

export function normalizeEmailForIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizePhoneForIdentity(value, country = "") {
  const input = String(value || "").trim();
  const digits = input.replace(/\D/g, "");

  if (!digits) return "";
  if (input.startsWith("+")) return `+${digits}`;
  if (input.startsWith("00")) return `+${digits.slice(2)}`;

  const countryProfile = getActiveCountryProfile(country);
  const dialDigits = countryProfile.dialCode.replace(/\D/g, "");

  if (digits.startsWith(dialDigits) && digits.length > dialDigits.length) {
    return `+${digits}`;
  }

  return `${countryProfile.dialCode}${digits.replace(/^0+/, "")}`;
}

function identityError(code, fallbackMessage = IDENTITY_UNAVAILABLE_MESSAGE) {
  const error = new Error(code === PHONE_ALREADY_LINKED_CODE ? PHONE_ALREADY_LINKED_MESSAGE : fallbackMessage);
  error.code = code || "identity_unavailable";
  return error;
}

function firstRpcRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

export async function checkKunThaiIdentityAvailability({ email = "", phone = "", country = "" }) {
  const normalizedEmail = normalizeEmailForIdentity(email);
  const normalizedPhone = normalizePhoneForIdentity(phone, country);
  const { data, error } = await supabase.rpc("preflight_kunthai_signup", {
    input_country: typeof country === "object" ? country.iso2 || country.name || "" : country,
    input_email: normalizedEmail || null,
    input_phone: normalizedPhone || null,
  });

  if (error) {
    throw identityError(
      "identity_check_unavailable",
      "We could not securely verify these account details. Please try again.",
    );
  }

  const result = firstRpcRow(data) || {};
  if (!result.allowed) {
    throw identityError(result.conflict_code);
  }

  return { normalizedEmail, normalizedPhone };
}

export async function findKunThaiAccount({ email, phone, country = "" }) {
  const normalizedEmail = normalizeEmailForIdentity(email);
  const normalizedPhone = normalizePhoneForIdentity(phone, country);
  const { data, error } = await supabase.rpc("find_kunthai_account", {
    input_country: typeof country === "object" ? country.iso2 || country.name || "" : country,
    input_email: normalizedEmail,
    input_phone: normalizedPhone,
  });

  if (error) {
    throw new Error("We could not securely look up this account. Please try again.");
  }

  const result = firstRpcRow(data) || {};
  if (result.rate_limited) {
    throw new Error("Too many lookup attempts. Please wait 15 minutes and try again.");
  }

  if (!result.account_found) {
    return null;
  }

  return {
    maskedName: result.masked_name || "",
    maskedEmail: result.masked_email || "",
    maskedPhone: result.masked_phone || "",
  };
}

export async function getKunThaiAccountEmailHint({ phone, country = "" }) {
  const normalizedPhone = normalizePhoneForIdentity(phone, country);
  const { data, error } = await supabase.rpc("get_kunthai_account_email_hint", {
    input_country: typeof country === "object" ? country.iso2 || country.name || "" : country,
    input_phone: normalizedPhone,
  });

  if (error) {
    throw new Error("We could not securely load the email hint.");
  }

  const result = firstRpcRow(data) || {};
  if (result.rate_limited) {
    throw new Error("Too many recovery attempts. Please wait 15 minutes and try again.");
  }

  return result.hint_found ? result.masked_email || "" : "";
}

export async function sendKunThaiAccountVerificationLink(email, redirectTo) {
  const normalizedEmail = normalizeEmailForIdentity(email);
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectTo,
    },
  });

  if (error) {
    throw new Error("We could not send the verification link. Please wait a moment and try again.");
  }
}

export function isPhoneAlreadyLinkedError(error) {
  return error?.code === PHONE_ALREADY_LINKED_CODE || error?.message === PHONE_ALREADY_LINKED_MESSAGE;
}
