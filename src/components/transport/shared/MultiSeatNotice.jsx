import { FiUsers } from "react-icons/fi";

import { useI18n, t } from "../../../i18n";

// One booking reserves every available seat. "caution": the UrRide caution
// card, for operators and passengers. "booking": the passenger's notice while
// booking a vehicle that seats more than one (seats = its passenger limit).
export default function MultiSeatNotice({ variant = "caution", seats = 0 }) {
  useI18n();

  if (variant === "booking") {
    if (!(Number(seats) > 1)) return null;
    return (
      <div className="flex items-start gap-3 rounded-2xl border-2 border-orange-300 bg-orange-50 p-3" role="note" data-testid="multi-seat-booking-notice">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-700">
          <FiUsers size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black text-orange-900">{t("urrideSeatsTrip.bookingSeatsTitle")}</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-orange-900">{t("urrideSeatsTrip.bookingSeatsBody", { n: seats })}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border-2 border-orange-300 bg-orange-50" data-testid="multi-seat-caution">
      <div className="flex items-center gap-3 bg-orange-600 px-4 py-3 text-white">
        <FiUsers size={20} className="shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/90">{t("urrideSeatsTrip.multiSeatEyebrow")}</p>
          <h3 className="text-base font-black leading-tight text-white">{t("urrideSeatsTrip.multiSeatTitle")}</h3>
        </div>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <SeatRule label={t("urrideSeatsTrip.multiSeatOperatorLabel")} body={t("urrideSeatsTrip.multiSeatOperatorBody")} />
        <SeatRule label={t("urrideSeatsTrip.multiSeatPassengerLabel")} body={t("urrideSeatsTrip.multiSeatPassengerBody")} />
      </div>
    </div>
  );
}

function SeatRule({ label, body }) {
  return (
    <div className="rounded-xl border border-orange-200 bg-white p-3">
      <p className="text-xs font-black uppercase tracking-wide text-orange-700">{label}</p>
      <p className="mt-1 text-sm font-bold leading-6 text-slate-900">{body}</p>
    </div>
  );
}
