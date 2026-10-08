// Turn a seller's WhatsApp field into a tappable chat link. The field may be a
// phone number ("+232 76 000 000", or a local "076 000 000" read with the
// business's country dialing code) or a wa.me / api.whatsapp.com link. Any
// other URL is rejected: it would send buyers somewhere that isn't WhatsApp.

import { getActiveCountryProfile, normalizeCountryPhoneDigits } from "../../../data/globalCountryProfiles";

const WHATSAPP_HOSTS = new Set(["wa.me", "www.wa.me", "api.whatsapp.com"]);
const PHONE_PATTERN = /^\+?[\d\s().-]+$/;

function parseWhatsAppLink(value) {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/+/, "")}`);
    return WHATSAPP_HOSTS.has(url.hostname.toLowerCase()) ? url : null;
  } catch {
    return null;
  }
}

function looksLikeLink(value) {
  return /^https?:\/\//i.test(value) || /[a-z]/i.test(value) || value.includes("/");
}

// Full international digits (no plus) for a phone number. A number written
// with "+" or "00" is already international; anything else is local to the
// business's country and gets that country's dialing code.
function internationalDigits(value, country) {
  const raw = String(value || "").trim();
  if (raw.startsWith("+")) return raw.replace(/\D/g, "");
  if (raw.startsWith("00")) return raw.replace(/\D/g, "").slice(2);
  const profile = getActiveCountryProfile(country);
  const dialDigits = String(profile.dialCode || "").replace(/\D/g, "");
  const national = normalizeCountryPhoneDigits(raw, profile);
  return national ? `${dialDigits}${national}` : "";
}

// Checks a WhatsApp field before saving. Returns { valid, value } where value
// is what to store: an accepted link as typed, or a phone number as a full
// international "+<digits>". An empty field is valid (WhatsApp is optional).
export function normalizeWhatsAppContact(rawValue, country = "") {
  const value = String(rawValue || "").trim();
  if (!value) return { valid: true, value: "" };

  if (looksLikeLink(value)) {
    const url = parseWhatsAppLink(value);
    return url ? { valid: true, value } : { valid: false, value };
  }

  if (!PHONE_PATTERN.test(value)) return { valid: false, value };
  const digits = internationalDigits(value, country);
  if (digits.length < 8 || digits.length > 15) return { valid: false, value };
  return { valid: true, value: `+${digits}` };
}

export function buildWhatsAppUrl(rawValue, message = "", country = "") {
  const value = String(rawValue || "").trim();
  if (!value) return "";

  const query = message ? `?text=${encodeURIComponent(message)}` : "";

  if (looksLikeLink(value)) {
    const url = parseWhatsAppLink(value);
    if (!url) return "";
    // Don't double-append a text query if the link already carries one.
    if (message && !url.searchParams.has("text")) url.searchParams.set("text", message);
    return url.toString();
  }

  // Otherwise treat it as a phone number: wa.me needs the full international
  // number as digits only, no plus.
  if (!PHONE_PATTERN.test(value)) return "";
  const digits = internationalDigits(value, country);
  if (digits.length < 6) return "";
  return `https://wa.me/${digits}${query}`;
}
