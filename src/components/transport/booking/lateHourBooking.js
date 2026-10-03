// When UrRide shows a late-hour booking warning, in the LOCAL time of the
// country being booked in:
//   19:30–19:59  evening  ("It is getting late")
//   20:00–05:29  night    (strongest warning)
//   05:30–06:29  morning  ("It is still early morning")
//   06:30–19:29  no warning
import { TIMEZONE_COUNTRIES } from "../../../data/timezoneCountries.js";

export const LATE_HOUR_WINDOWS = Object.freeze({
  eveningStart: 19 * 60 + 30,
  nightStart: 20 * 60,
  morningStart: 5 * 60 + 30,
  morningEnd: 6 * 60 + 30,
});

// "evening" | "night" | "morning" | null for a minute of the local day.
export function lateHourPhase(minutesOfDay) {
  const minutes = Number(minutesOfDay);
  if (!Number.isFinite(minutes)) return null;
  const { eveningStart, nightStart, morningStart, morningEnd } = LATE_HOUR_WINDOWS;
  if (minutes >= nightStart || minutes < morningStart) return "night";
  if (minutes >= eveningStart) return "evening";
  if (minutes < morningEnd) return "morning";
  return null;
}

// Hour and minute at `date` in `timeZone` (IANA), e.g. { hour: 20, minute: 5 }.
export function localTimeParts(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return { hour: hour % 24, minute, minutesOfDay: (hour % 24) * 60 + minute };
  } catch {
    return null;
  }
}

function zoneOffsetMinutes(date, timeZone) {
  const parts = localTimeParts(date, timeZone);
  if (!parts) return null;
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  let diff = parts.minutesOfDay - utcMinutes;
  if (diff > 14 * 60) diff -= 24 * 60;
  if (diff < -12 * 60) diff += 24 * 60;
  return diff;
}

export function zonesForCountry(countryIso) {
  const iso = String(countryIso || "").toUpperCase();
  if (!iso) return [];
  return Object.entries(TIMEZONE_COUNTRIES).filter(([, country]) => country === iso).map(([zone]) => zone);
}

// The time zone to judge "late" by:
// 1. the phone's own zone when it belongs to the booking country (exact, even
//    in countries with several zones);
// 2. otherwise that country's zone, choosing — when it has several — the one
//    whose UTC offset best matches the pickup's longitude;
// 3. otherwise the phone's zone.
export function bookingTimeZone({ countryIso = "", longitude = null, deviceTimeZone = "", date = new Date() } = {}) {
  const iso = String(countryIso || "").toUpperCase();
  const device = deviceTimeZone || (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; }
  })();
  if (!iso) return device || "UTC";
  if (device && TIMEZONE_COUNTRIES[device] === iso) return device;

  const zones = zonesForCountry(iso);
  if (!zones.length) return device || "UTC";
  if (zones.length === 1 || !Number.isFinite(Number(longitude))) return zones[0];

  const solarOffset = Number(longitude) * 4; // minutes: 15° of longitude = 1 hour
  let best = zones[0];
  let bestGap = Infinity;
  for (const zone of zones) {
    const offset = zoneOffsetMinutes(date, zone);
    if (offset === null) continue;
    const gap = Math.abs(offset - solarOffset);
    if (gap < bestGap) {
      best = zone;
      bestGap = gap;
    }
  }
  return best;
}

// Everything the warning needs: phase, the zone used, and the local time text.
export function lateHourStatus({ date = new Date(), countryIso = "", longitude = null, deviceTimeZone = "" } = {}) {
  const timeZone = bookingTimeZone({ countryIso, longitude, deviceTimeZone, date });
  const parts = localTimeParts(date, timeZone);
  if (!parts) return { phase: null, timeZone, localTime: "" };
  const localTime = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  return { phase: lateHourPhase(parts.minutesOfDay), timeZone, localTime, minutesOfDay: parts.minutesOfDay };
}
