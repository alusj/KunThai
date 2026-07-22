import supabase from "../lib/supabaseClient";
import { readStoredCountryIso } from "../../data/globalCountryProfiles";

// Contact import: numbers are sent once to the match RPC and never stored.
// The database side rejects guests and caps each request at 100 numbers.

export function isContactPickerSupported() {
  return typeof navigator !== "undefined" && "contacts" in navigator && typeof navigator.contacts?.select === "function";
}

export async function pickDeviceContactNumbers() {
  if (!isContactPickerSupported()) return [];
  const picked = await navigator.contacts.select(["tel"], { multiple: true });
  return (picked || [])
    .flatMap((contact) => contact.tel || [])
    .map((value) => String(value).trim())
    .filter(Boolean);
}

export function parsePastedNumbers(text = "") {
  return String(text)
    .split(/[\n,;]+/)
    .map((value) => value.replace(/[^\d+ ]/g, "").trim())
    .filter((value) => value.replace(/\D/g, "").length >= 6)
    .slice(0, 100);
}

export async function matchContactsToKunThaiAccounts(phones = []) {
  const list = [...new Set(phones.filter(Boolean))].slice(0, 100);
  if (!list.length) return [];

  const { data, error } = await supabase.rpc("match_contacts_to_kunthai_accounts", {
    p_phones: list,
    p_country_hint: readStoredCountryIso() || null,
  });

  if (error) throw new Error(error.message || "Unable to check your contacts right now.");

  return (data || []).map((row) => ({
    userId: row.user_id,
    publicUserId: row.public_user_id || "",
    displayName: row.display_name || "KunThai account",
    username: row.username || "",
    avatarUrl: row.avatar_url || "",
  }));
}
