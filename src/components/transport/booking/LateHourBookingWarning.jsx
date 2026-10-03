import { useEffect, useState } from "react";
import { FiAlertOctagon, FiCheck, FiClock, FiMapPin, FiMoon, FiNavigation, FiPhoneCall, FiSunrise, FiSunset } from "react-icons/fi";
import AppPortal from "../../shared/AppPortal";
import { t, useI18n } from "../../../i18n";

const PHASES = {
  evening: {
    icon: FiSunset,
    eyebrow: "urride.lateHour.eveningEyebrow",
    title: "urride.lateHour.eveningTitle",
    lead: "urride.lateHour.eveningLead",
    frame: "from-amber-400 via-orange-500 to-orange-600",
    badge: "bg-orange-500",
    text: "text-orange-700",
  },
  night: {
    icon: FiMoon,
    eyebrow: "urride.lateHour.nightEyebrow",
    title: "urride.lateHour.nightTitle",
    lead: "urride.lateHour.nightLead",
    frame: "from-red-500 via-rose-600 to-red-800",
    badge: "bg-red-600",
    text: "text-red-700",
  },
  morning: {
    icon: FiSunrise,
    eyebrow: "urride.lateHour.morningEyebrow",
    title: "urride.lateHour.morningTitle",
    lead: "urride.lateHour.morningLead",
    frame: "from-sky-500 via-indigo-500 to-violet-600",
    badge: "bg-indigo-600",
    text: "text-indigo-700",
  },
};

// Floating safety card shown before a ride or delivery is booked late in the
// evening, at night or early in the morning (local time of the booking
// country). The passenger must confirm they have read it before booking.
export default function LateHourBookingWarning({ phase, localTime = "", countryName = "", onConfirm, onCancel }) {
  useI18n();
  const [acknowledged, setAcknowledged] = useState(false);
  const meta = PHASES[phase] || PHASES.night;
  const Icon = meta.icon;

  useEffect(() => {
    function onKey(event) { if (event.key === "Escape") onCancel?.(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <AppPortal>
      <div className="fixed inset-0 z-[1500] flex items-end justify-center p-3 sm:items-center sm:p-6" role="presentation">
        <div className="kt-backdrop absolute inset-0 bg-slate-950/70 backdrop-blur-sm" aria-hidden="true" />
        <section
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="late-hour-title"
          aria-describedby="late-hour-lead"
          className={`kt-panel-enter relative w-full max-w-lg rounded-[28px] bg-gradient-to-br p-[3px] shadow-2xl ${meta.frame}`}
        >
          <div className="flex max-h-[88dvh] flex-col overflow-hidden rounded-[25px] bg-white">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl text-white shadow-lg ${meta.badge}`}>
                  <Icon aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className={`text-[11px] font-black uppercase tracking-[0.18em] ${meta.text}`}>{t(meta.eyebrow)}</p>
                  <h2 id="late-hour-title" className="mt-1 text-xl font-black leading-tight text-slate-950">{t(meta.title)}</h2>
                  {localTime ? (
                    <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-black text-slate-500">
                      <FiClock aria-hidden="true" />
                      {t("urride.lateHour.localTime", { country: countryName || "", time: localTime })}
                    </p>
                  ) : null}
                </div>
              </div>

              <p id="late-hour-lead" className={`mt-4 text-sm font-bold leading-6 ${phase === "night" ? "text-red-800" : "text-slate-700"}`}>{t(meta.lead)}</p>

              <div className="mt-4 rounded-2xl border-2 border-slate-900/10 bg-slate-950 p-4 text-white">
                <p className="flex items-center gap-2 text-sm font-black uppercase tracking-wide">
                  <FiAlertOctagon className="shrink-0 text-amber-300" aria-hidden="true" />
                  {t("urride.lateHour.roleTitle")}
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-200">{t("urride.lateHour.roleBody")}</p>
                <p className="mt-3 text-xs font-black uppercase tracking-wide text-emerald-300">{t("urride.lateHour.canTitle")}</p>
                <ul className="mt-2 grid gap-1.5 text-sm font-semibold text-slate-100">
                  <li className="flex items-start gap-2"><FiNavigation className="mt-0.5 shrink-0 text-emerald-300" aria-hidden="true" />{t("urride.lateHour.can1")}</li>
                  <li className="flex items-start gap-2"><FiMapPin className="mt-0.5 shrink-0 text-emerald-300" aria-hidden="true" />{t("urride.lateHour.can2")}</li>
                  <li className="flex items-start gap-2"><FiPhoneCall className="mt-0.5 shrink-0 text-emerald-300" aria-hidden="true" />{t("urride.lateHour.can3")}</li>
                </ul>
              </div>

              <p className="mt-4 text-xs font-black uppercase tracking-wide text-slate-500">{t("urride.lateHour.checkTitle")}</p>
              <ol className="mt-2 grid gap-2">
                {["check1", "check2", "check3"].map((key, index) => (
                  <li key={key} className="flex items-start gap-3 rounded-2xl bg-slate-50 px-3 py-2.5 text-sm font-semibold leading-5 text-slate-700">
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-black text-white ${meta.badge}`}>{index + 1}</span>
                    {t(`urride.lateHour.${key}`)}
                  </li>
                ))}
              </ol>
            </div>

            <div className="shrink-0 border-t border-slate-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600"
                />
                <span className="text-sm font-bold leading-5 text-slate-800">{t("urride.lateHour.acknowledge")}</span>
              </label>
              <button
                type="button"
                disabled={!acknowledged}
                onClick={onConfirm}
                className={`mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-black transition ${
                  acknowledged
                    ? "kt-pressable bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700"
                    : "cursor-not-allowed bg-slate-200 text-slate-400"
                }`}
              >
                <FiCheck aria-hidden="true" />
                {t("urride.lateHour.confirm")}
              </button>
              <button type="button" onClick={onCancel} className="mt-2 h-11 w-full rounded-2xl text-sm font-black text-slate-600 hover:bg-slate-100">
                {t("urride.lateHour.cancel")}
              </button>
            </div>
          </div>
        </section>
      </div>
    </AppPortal>
  );
}
