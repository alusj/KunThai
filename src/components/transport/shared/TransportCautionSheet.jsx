import { createElement } from "react";

import { t } from "../../../i18n";
import { useI18n as useUiLocale } from "../../../i18n/index.js";

// The selected-fleet booking caution. Open booking shows this same text first
// and then its own open-booking rules, so both flows share one source.
export function PassengerBookingCautionBody() {
  useUiLocale();
  return (
    <div className="grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-sm font-semibold leading-6 text-slate-600 shadow-sm">
      <p>{t("urride.booking.cautionP1")}</p>
      <p>{t("urride.booking.cautionP2")}</p>
      <p>{t("urride.booking.cautionP3")}</p>
      <p>{t("urride.booking.cautionP4")}</p>
    </div>
  );
}

// UrRide caution / guide cards use the same frame as the booking drawer: a
// full-height panel (right-hand panel on wide screens) with a fixed header, a
// scrolling body and a pinned footer, so "don't show again" and the confirm
// button are always on screen instead of below a half-height sheet's fold.
export default function TransportCautionSheet({
  icon,
  eyebrow,
  title,
  titleId,
  children,
  dontShowAgain,
  onDontShowAgainChange,
  dontShowLabel,
  confirmLabel,
  confirmIcon = null,
  onConfirm,
  footerExtra = null,
  positioning = "fixed",
  zIndexClass = "z-[1400]",
}) {
  useUiLocale();
  return (
    <div className={`${positioning} inset-0 ${zIndexClass} flex justify-end`} role="presentation">
      <div className="kt-backdrop absolute inset-0 bg-slate-950/45 backdrop-blur-sm" aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="kt-panel-enter relative flex h-full w-full max-w-2xl flex-col bg-gray-50 text-slate-950 shadow-2xl"
      >
        <header className="kt-header-glass flex shrink-0 items-center gap-3 border-b border-emerald-100 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
            {icon ? createElement(icon, { size: 22, "aria-hidden": true }) : null}
          </span>
          <div className="min-w-0">
            {eyebrow ? <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">{eyebrow}</p> : null}
            <h2 id={titleId} className="mt-0.5 text-lg font-black leading-tight text-slate-950 sm:text-xl">{title}</h2>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {children}
        </div>

        <footer className="shrink-0 border-t border-gray-100 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
          {footerExtra}
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(event) => onDontShowAgainChange(event.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600"
            />
            <span className="text-sm font-bold leading-5 text-slate-700">{dontShowLabel}</span>
          </label>
          <button
            type="button"
            onClick={onConfirm}
            className="kt-pressable mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700"
          >
            {confirmIcon ? createElement(confirmIcon, { size: 19, "aria-hidden": true }) : null}
            {confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
