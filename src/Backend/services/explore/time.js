// Age of a post, comment or notification, in words.
//
// Anything younger than a minute reads "Just now" — a post or comment the
// person has only just written must never claim to be a minute old. A
// timestamp slightly in the future (the device clock running behind the
// server) counts as just now too.
const MINUTE_MS = 60_000;

export function formatRelativeTime(value, locale = typeof document === "undefined" ? "en" : document.documentElement.lang || "en") {
  const language = locale.split("-")[0];
  const justNow = { en: "Just now", fr: "À l’instant", ar: "الآن", es: "Ahora mismo", zh: "刚刚" }[language] || "Just now";
  if (!value) {
    return justNow;
  }

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return justNow;
  }

  const diffMs = Date.now() - timestamp;
  if (diffMs < MINUTE_MS) {
    return justNow;
  }

  const diffMinutes = Math.floor(diffMs / MINUTE_MS);
  if (language !== "en") {
    const unit = diffMinutes < 60 ? "minute" : diffMinutes < 1440 ? "hour" : "day";
    const amount = unit === "minute" ? diffMinutes : unit === "hour" ? Math.floor(diffMinutes / 60) : Math.floor(diffMinutes / 1440);
    return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-amount, unit);
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} min${diffMinutes === 1 ? "" : "s"} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}
