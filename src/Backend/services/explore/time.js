// Age of a post, comment or notification, in words.
//
// Anything younger than a minute reads "Just now" — a post or comment the
// person has only just written must never claim to be a minute old. A
// timestamp slightly in the future (the device clock running behind the
// server) counts as just now too.
const MINUTE_MS = 60_000;

export function formatRelativeTime(value) {
  if (!value) {
    return "Just now";
  }

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return "Just now";
  }

  const diffMs = Date.now() - timestamp;
  if (diffMs < MINUTE_MS) {
    return "Just now";
  }

  const diffMinutes = Math.floor(diffMs / MINUTE_MS);
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
