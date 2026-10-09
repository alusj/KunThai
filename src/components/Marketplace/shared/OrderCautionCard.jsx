import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ExternalLink, House, MessageCircle, ShieldAlert, ShieldCheck, Store, Truck, UtensilsCrossed } from "lucide-react";

import { useBrowserBack } from "../../../Backend/hooks/useBrowserBack";
import { t, useI18n } from "../../../i18n";
import AppPortal from "../../shared/AppPortal";
import useBodyScrollLock from "../../shared/useBodyScrollLock";
import { orderCautionContent } from "./orderCaution";

// The order / booking caution card. One design for all four UrMall business
// kinds; the copy (orderCaution.<kind>.*) and the accent change per kind.
// Matches the app's caution cards: blue platform note, amber safety note.

const KIND_STYLE = {
  retail: { icon: Store, chip: "bg-blue-100 text-blue-700", stripe: "from-blue-500 via-sky-500 to-emerald-500", dot: "bg-blue-600" },
  vendor: { icon: Truck, chip: "bg-emerald-100 text-emerald-700", stripe: "from-emerald-500 via-teal-500 to-blue-500", dot: "bg-emerald-600" },
  restaurant: { icon: UtensilsCrossed, chip: "bg-orange-100 text-orange-700", stripe: "from-orange-500 via-amber-500 to-rose-500", dot: "bg-orange-600" },
  realEstate: { icon: House, chip: "bg-violet-100 text-violet-700", stripe: "from-violet-600 via-indigo-500 to-blue-500", dot: "bg-violet-600" },
};

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function OrderCautionKindIcon({ kind, size = 22, className = "h-12 w-12" }) {
  const style = KIND_STYLE[orderCautionContent(kind).kind];
  const Icon = style.icon;
  return (
    <span className={`grid shrink-0 place-items-center rounded-2xl ${style.chip} ${className}`} aria-hidden="true">
      <Icon size={size} />
    </span>
  );
}

// The card's reading content: the platform note, the kind's tips, the common
// safety lines and the Policy Center link. Shared by the pop-up and the buyer
// menu's Caution Card screen.
export function OrderCautionBody({ kind, introId }) {
  useI18n();
  const content = orderCautionContent(kind);
  const style = KIND_STYLE[content.kind];
  return (
    <>
      <div className="flex items-start gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-blue-950">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-blue-700" aria-hidden="true" />
        <p id={introId} className="text-[13px] font-bold leading-5">{t(content.introKey)}</p>
      </div>

      <p className="mt-4 text-[11px] font-black uppercase tracking-wide text-slate-500">{t("orderCaution.tipsHeading")}</p>
      <ul className="mt-2 grid gap-2">
        {content.tipKeys.map((key) => (
          <li key={key} className="flex items-start gap-2.5 text-[13px] font-semibold leading-5 text-slate-700">
            <span className={`mt-[0.45rem] h-2 w-2 shrink-0 rounded-full ${style.dot}`} aria-hidden="true" />
            <span>{t(key)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
        <p className="flex items-start gap-2 text-xs font-bold leading-5">
          <MessageCircle size={16} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
          <span>{t("orderCaution.common.chat")}</span>
        </p>
        <p className="flex items-start gap-2 text-xs font-bold leading-5">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
          <span>{t("orderCaution.common.report")}</span>
        </p>
      </div>

      <a
        href={content.policyHref}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800"
      >
        {t("orderCaution.policyLink")}
        <ExternalLink size={12} aria-hidden="true" />
      </a>
    </>
  );
}

/**
 * The pop-up shown when a buyer taps Order / Book. `onResolve` receives
 * { action: "continue" | "cancel", dontShowAgain } once the card has closed.
 * Every close (buttons, Escape, the backdrop, the phone's Back) goes through
 * the same browser-history layer, so no stray history entry is left behind.
 */
export default function OrderCautionDialog({ kind, onResolve }) {
  useI18n();
  const content = orderCautionContent(kind);
  const style = KIND_STYLE[content.kind];
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const resultRef = useRef({ action: "cancel", dontShowAgain: false });
  const resolvedRef = useRef(false);
  const sectionRef = useRef(null);
  const onResolveRef = useRef(onResolve);
  onResolveRef.current = onResolve;
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const introId = `${baseId}-intro`;

  const finish = useCallback(() => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    onResolveRef.current?.(resultRef.current);
  }, []);

  const closeLayer = useBrowserBack(true, finish, `urmall-order-caution-${content.kind}`);

  const close = useCallback((action) => {
    if (resolvedRef.current) return;
    resultRef.current = { action, dontShowAgain: action === "continue" && dontShowAgain };
    closeLayer();
  }, [closeLayer, dontShowAgain]);

  useBodyScrollLock(true);

  // Focus the card when it opens and give focus back to whatever opened it.
  useEffect(() => {
    const opener = document.activeElement;
    sectionRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener && typeof opener.focus === "function" && document.contains(opener)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);

  // Escape cancels. Caught first (capture) so the detail screen or cart
  // underneath does not close on the same key press.
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close("cancel");
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [close]);

  // Keep Tab inside the card.
  function trapFocus(event) {
    if (event.key !== "Tab" || !sectionRef.current) return;
    const items = Array.from(sectionRef.current.querySelectorAll(FOCUSABLE));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === sectionRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <AppPortal>
      <div className="fixed inset-0 z-[1500] flex items-end justify-center p-3 sm:items-center sm:p-6" role="presentation" data-order-caution={content.kind}>
        <button
          type="button"
          tabIndex={-1}
          aria-label={t("orderCaution.cancel")}
          onClick={() => close("cancel")}
          className="kt-backdrop absolute inset-0 border-0 bg-slate-950/65 p-0 backdrop-blur-[2px]"
        />
        <section
          ref={sectionRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={introId}
          tabIndex={-1}
          onKeyDown={trapFocus}
          className="kt-toast-expand-in relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl outline-none sm:max-h-[calc(100dvh-3rem)]"
        >
          <div className={`h-1.5 shrink-0 bg-gradient-to-r ${style.stripe}`} aria-hidden="true" />

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4 sm:px-5">
            <div className="flex items-start gap-3">
              <OrderCautionKindIcon kind={content.kind} />
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-700">
                  {t(content.kind === "realEstate" ? "orderCaution.eyebrowBook" : "orderCaution.eyebrowOrder")}
                  <span aria-hidden="true"> · </span>
                  {t(content.labelKey)}
                </p>
                <h2 id={titleId} className="mt-1 text-lg font-black leading-tight text-slate-950 sm:text-xl">{t(content.titleKey)}</h2>
              </div>
            </div>

            <div className="mt-4">
              <OrderCautionBody kind={content.kind} introId={introId} />
            </div>
          </div>

          <div className="shrink-0 border-t border-slate-100 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(event) => setDontShowAgain(event.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600"
              />
              <span className="min-w-0">
                <span className="block text-sm font-black text-slate-900">{t("orderCaution.dontShow")}</span>
                <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-slate-500">{t("orderCaution.dontShowHint")}</span>
              </span>
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => close("cancel")}
                className="kt-pressable h-12 rounded-2xl bg-slate-100 px-3 text-sm font-black text-slate-700 transition hover:bg-slate-200"
              >
                {t("orderCaution.cancel")}
              </button>
              <button
                type="button"
                onClick={() => close("continue")}
                className="kt-pressable h-12 rounded-2xl bg-blue-600 px-3 text-sm font-black text-white shadow-lg shadow-blue-900/20 transition hover:bg-blue-700"
              >
                {t("orderCaution.continue")}
              </button>
            </div>
          </div>
        </section>
      </div>
    </AppPortal>
  );
}
