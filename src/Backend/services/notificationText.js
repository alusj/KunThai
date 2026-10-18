// A notification card shows a title and, under it, a body. Many notices
// (payments, adverts, KunThai announcements) store the same sentence in both,
// or a cut-off copy of the title as the body, so the card read twice. Every
// sector's notification list runs its text through this first.

function comparable(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[“”"'‘’«»]/g, "")
    .replace(/(\.{3}|…)\s*$/u, "")
    .replace(/\s+/g, " ")
    .replace(/[\s.!?,:;]+$/u, "")
    .trim();
}

// { title, body } to show. The body is dropped when it only repeats the title
// (whole or cut short); when the body is the title plus more, the body alone
// is shown as the title so nothing is said twice.
export function notificationDisplayText(title, body) {
  const titleText = String(title || "").trim();
  const bodyText = String(body || "").trim();
  const a = comparable(titleText);
  const b = comparable(bodyText);
  if (!b) return { title: titleText, body: "" };
  if (!a) return { title: bodyText, body: "" };
  if (a === b || a.startsWith(b)) return { title: titleText, body: "" };
  if (b.startsWith(a)) return { title: bodyText, body: "" };
  return { title: titleText, body: bodyText };
}
