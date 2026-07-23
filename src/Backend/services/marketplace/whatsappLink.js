// Turn a seller's WhatsApp field into a tappable chat link. The field may be a
// raw phone number ("+232 76 000 000"), a wa.me / whatsapp.com link, or a full
// URL — all resolve to a URL that opens a WhatsApp conversation.

export function buildWhatsAppUrl(rawValue, message = "") {
  const value = String(rawValue || "").trim();
  if (!value) return "";

  const query = message ? `?text=${encodeURIComponent(message)}` : "";

  // Already a link (wa.me, api.whatsapp.com, chat.whatsapp.com, or any http).
  if (/^https?:\/\//i.test(value) || /wa\.me|whatsapp\.com/i.test(value)) {
    const url = /^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/+/, "")}`;
    // Don't double-append a text query if the link already carries one.
    if (query && !/[?&]text=/i.test(url)) {
      return url + (url.includes("?") ? `&text=${encodeURIComponent(message)}` : query);
    }
    return url;
  }

  // Otherwise treat it as a phone number: wa.me needs digits only, no plus.
  const digits = value.replace(/[^\d]/g, "");
  if (digits.length < 6) return "";
  return `https://wa.me/${digits}${query}`;
}
