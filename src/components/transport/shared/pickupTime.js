import { t } from "../../../i18n";

// Pickup time shown to both passenger and operator. A trip without
// scheduled_at was booked for "Now"; otherwise show the time the passenger
// chose, adding the date only when it isn't today.
export function formatTripPickupTime(scheduledAt) {
  const date = scheduledAt ? new Date(scheduledAt) : null;
  if (!date || Number.isNaN(date.getTime())) return t("urride.booking.now");
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === new Date().toDateString()) return time;
  return `${date.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}
