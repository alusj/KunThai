import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { FiChevronsDown } from "react-icons/fi";

import { t } from "../../../i18n";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../i18n/index.js";

// How close (px) to the bottom counts as "read to the end" — absorbs sub-pixel
// rounding on high-DPI phones where scrollTop never quite reaches the max.
const READ_END_TOLERANCE = 12;

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

// Tracks whether the person has scrolled the notice body to its end. Content
// that already fits without scrolling counts as read straight away, and a
// resize (rotation, font scaling, longer translated copy) re-checks it, so the
// confirm button can never be stuck disabled.
function useReadToEnd(enabled) {
  const bodyRef = useRef(null);
  const [readToEnd, setReadToEnd] = useState(!enabled);
  const [progress, setProgress] = useState(enabled ? 0 : 1);

  const measure = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    const scrollable = body.scrollHeight - body.clientHeight;
    if (scrollable <= READ_END_TOLERANCE) {
      setProgress(1);
      setReadToEnd(true);
      return;
    }
    const ratio = Math.min(1, Math.max(0, body.scrollTop / scrollable));
    setProgress((current) => Math.max(current, ratio));
    if (body.scrollTop >= scrollable - READ_END_TOLERANCE) setReadToEnd(true);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const body = bodyRef.current;
    if (!body) return undefined;
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(body);
    if (body.firstElementChild) observer?.observe(body.firstElementChild);
    return () => observer?.disconnect();
  }, [enabled, measure]);

  return { bodyRef, readToEnd: !enabled || readToEnd, progress, onScroll: enabled ? measure : undefined };
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
  // Safety notices keep the confirm button disabled until the body has been
  // scrolled to the end, so nobody accepts conditions they never saw.
  requireScroll = false,
}) {
  useUiLocale();
  const { bodyRef, readToEnd, progress, onScroll } = useReadToEnd(requireScroll);

  function scrollFurther() {
    const body = bodyRef.current;
    if (!body) return;
    body.scrollBy({ top: Math.max(160, body.clientHeight * 0.8), behavior: "smooth" });
  }

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

        {requireScroll ? (
          <div className="h-1 shrink-0 bg-emerald-50" aria-hidden="true">
            <div className="h-full bg-emerald-500 transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        ) : null}

        <div ref={bodyRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          <div>{children}</div>
        </div>

        <footer className="shrink-0 border-t border-gray-100 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
          {footerExtra}
          {!readToEnd ? (
            <button
              type="button"
              onClick={scrollFurther}
              className="kt-pressable mb-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-xs font-black text-amber-800 ring-1 ring-amber-200"
            >
              <FiChevronsDown size={15} aria-hidden="true" className="animate-bounce" />
              {translateUi("Scroll to the end to continue")}
            </button>
          ) : null}
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
            onClick={readToEnd ? onConfirm : undefined}
            disabled={!readToEnd}
            className={`mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-black transition ${
              readToEnd
                ? "kt-pressable bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700"
                : "cursor-not-allowed bg-slate-200 text-slate-400"
            }`}
          >
            {confirmIcon ? createElement(confirmIcon, { size: 19, "aria-hidden": true }) : null}
            {confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
