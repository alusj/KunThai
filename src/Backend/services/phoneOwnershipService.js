import supabase from "../lib/supabaseClient";
import { t } from "../../i18n";
import { getActiveCountryProfile } from "../../data/globalCountryProfiles";
import { normalizePhoneForIdentity } from "./accountIdentityService";

// One phone number, one KunThai account. Contact numbers on UrMall
// businesses, UrRide operators and companies and Explore Spaces may be the
// person's own number but not one that belongs to a different account. The
// database enforces it (trigger "KT_PHONE_IN_USE",
// 20261016140000_phone_one_account.sql); this is the inline check the forms
// run while the person types. Emergency contacts are never checked.

export const PHONE_IN_USE_CODE = "KT_PHONE_IN_USE";
const MIN_DIGITS = 7;

export function phoneInUseMessage() {
  return t("phoneOwnership.inUse");
}

function countryHint(country) {
  if (!country) return "";
  if (typeof country === "object") return country.iso2 || country.name || "";
  return getActiveCountryProfile(country)?.iso2 || String(country);
}

export function phoneDigitCount(phone) {
  return String(phone || "").replace(/\D/g, "").length;
}

// true: used by another account. false: free (or the person's own).
// null: could not tell (offline, or the database function is not installed);
// the save itself is still guarded by the database.
export async function isPhoneUsedByAnotherAccount(phone, country = "") {
  if (phoneDigitCount(phone) < MIN_DIGITS) return false;
  const hint = countryHint(country);
  const normalized = normalizePhoneForIdentity(phone, hint || country);
  if (!normalized) return false;
  try {
    const { data, error } = await supabase.rpc("kunthai_phone_in_use", {
      p_phone: normalized,
      p_country: hint || null,
    });
    if (error) return null;
    return data === true;
  } catch {
    return null;
  }
}

export function isPhoneInUseError(error) {
  const text = typeof error === "string" ? error : String(error?.message || error?.details || "");
  return error?.code === PHONE_IN_USE_CODE || text.includes(PHONE_IN_USE_CODE);
}

// A save refused by the database becomes the friendly inline message.
export function toPhoneInUseError(error) {
  if (!isPhoneInUseError(error)) return error;
  const friendly = new Error(phoneInUseMessage());
  friendly.code = PHONE_IN_USE_CODE;
  return friendly;
}

// For save paths: refuse early with the friendly message (no-op when unsure).
export async function assertPhoneAvailable(phone, country = "") {
  if (await isPhoneUsedByAnotherAccount(phone, country)) {
    const error = new Error(phoneInUseMessage());
    error.code = PHONE_IN_USE_CODE;
    throw error;
  }
}
