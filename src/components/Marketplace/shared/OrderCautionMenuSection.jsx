import { useEffect, useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";

import { t, useI18n } from "../../../i18n";
import { OrderCautionBody, OrderCautionKindIcon } from "./OrderCautionCard";
import { ORDER_CAUTION_KINDS, orderCautionContent, readHiddenOrderCautions, resetOrderCautions } from "./orderCaution";
import { readOrderCautionUserId } from "./useOrderCautionGate";

// The buyer menu's Caution Card screen: every order / booking card can be read
// here at any time, and the ones hidden with "Don't show this again" can be
// turned back on.
export default function OrderCautionMenuSection() {
  useI18n();
  const [userId, setUserId] = useState(null);
  const [hidden, setHidden] = useState([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let alive = true;
    readOrderCautionUserId().then((id) => {
      if (!alive) return;
      setUserId(id);
      setHidden(readHiddenOrderCautions(id));
    });
    return () => { alive = false; };
  }, []);

  function showAllAgain() {
    resetOrderCautions(userId);
    setHidden(readHiddenOrderCautions(userId));
    setStatus(t("orderCaution.menu.resetDone"));
  }

  return (
    <section className="mt-5 rounded-[28px] border border-blue-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="order-caution-menu-title">
      <h2 id="order-caution-menu-title" className="text-lg font-black text-slate-950">{t("orderCaution.menu.title")}</h2>
      <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{t("orderCaution.menu.body")}</p>

      <div className="mt-4 grid gap-2">
        {ORDER_CAUTION_KINDS.map((kind) => {
          const content = orderCautionContent(kind);
          const isHidden = hidden.includes(kind);
          return (
            <details key={kind} className="group rounded-2xl border border-slate-200 bg-slate-50 open:bg-white">
              <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl p-3 [&::-webkit-details-marker]:hidden">
                <OrderCautionKindIcon kind={kind} size={18} className="h-10 w-10" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-slate-950">{t(content.labelKey)}</span>
                  <span className="block truncate text-xs font-semibold text-slate-500">{t(content.titleKey)}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black ${isHidden ? "bg-slate-200 text-slate-600" : "bg-emerald-100 text-emerald-700"}`}>
                  {t(isHidden ? "orderCaution.menu.hidden" : "orderCaution.menu.shown")}
                </span>
                <ChevronDown size={18} className="shrink-0 text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="px-3 pb-3">
                <OrderCautionBody kind={kind} />
              </div>
            </details>
          );
        })}
      </div>

      {hidden.length ? (
        <button
          type="button"
          onClick={showAllAgain}
          disabled={userId === null}
          className="kt-pressable mt-3 inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          <RotateCcw size={16} aria-hidden="true" />
          {t("orderCaution.menu.reset")}
        </button>
      ) : null}
      {status ? <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700" role="status">{status}</p> : null}
    </section>
  );
}
