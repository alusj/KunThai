import { t, useI18n } from "../../../i18n";

// Fields shared by the fleet booking drawer and the open-booking sheet.

/** Passenger count limited to what the vehicle seats (motorbike 1, tricycle 3, taxi 4). */
export function PassengerCountSelect({ value, max = 4, onChange }) {
  useI18n();
  const limit = Math.max(1, Number(max) || 1);
  const counts = Array.from({ length: limit }, (_, index) => index + 1);
  return (
    <select
      value={String(Math.min(Number(value) || 1, limit))}
      onChange={(event) => onChange(event.target.value)}
      disabled={limit === 1}
      className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500 disabled:opacity-80"
    >
      {counts.map((count) => (
        <option key={count} value={String(count)}>
          {count === 1 ? t("urride.booking.passengerCountOne", { count }) : t("urride.booking.passengerCount", { count })}
        </option>
      ))}
    </select>
  );
}

/** Pickup now, or at a scheduled time. */
export function PickupTimeFields({ pickupTime = "now", scheduledAt = "", onChange }) {
  useI18n();
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <label className="space-y-1">
        <span className="text-xs font-black uppercase text-gray-500">{t("urride.booking.pickupTime")}</span>
        <select
          value={pickupTime}
          onChange={(event) => onChange({ pickupTime: event.target.value })}
          className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-black text-gray-950 outline-none focus:border-emerald-500"
        >
          <option value="now">{t("urride.booking.now")}</option>
          <option value="schedule">{t("urride.booking.schedule")}</option>
        </select>
      </label>

      <label className="space-y-1 md:col-span-2">
        <span className="text-xs font-black uppercase text-gray-500">{t("urride.booking.scheduledTime")}</span>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(event) => onChange({ scheduledAt: event.target.value })}
          disabled={pickupTime !== "schedule"}
          className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-950 outline-none focus:border-emerald-500 disabled:text-gray-400"
        />
      </label>
    </div>
  );
}
