import { CheckCircle2, ChevronRight } from "lucide-react";
import { useState } from "react";

import { useI18n, t } from "../../../../../i18n";

export default function HealthScoreCard({ health, onEditProfile }) {
  useI18n();
  const [expanded, setExpanded] = useState(false);
  const missingItems = health.missingItems || [];
  const complete = Number(health.score || 0) >= 100 || missingItems.length === 0;

  return (
    <section className="relative overflow-hidden rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm">
      <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-emerald-100/60 blur-3xl" aria-hidden="true" />
      <div className="flex items-start justify-between gap-4">
        <div className="relative">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">{health.label}</p>
          <p className="mt-1 text-3xl font-black text-gray-950">
            {health.score}%
          </p>
        </div>

        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-sm font-black text-emerald-800 shadow-sm">
          {health.score}%
        </div>
      </div>

      <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-[width] duration-700 ease-out"
          style={{ width: `${health.score}%` }}
        />
      </div>

      <p className="mt-3 text-sm font-medium leading-5 text-gray-500">
        {health.nextStep}
      </p>

      <button
        type="button"
        onClick={() => {
          if (complete) {
            onEditProfile?.();
            return;
          }
          setExpanded((current) => !current);
        }}
        aria-expanded={!complete ? expanded : undefined}
        className="relative mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-md"
      >
        {complete ? t("urmall.biz.dash.reviewSetup") : expanded ? t("urmall.biz.dash.hideMissing") : t("urmall.biz.dash.viewMissing", { count: missingItems.length })}
        <ChevronRight size={16} className={`transition-transform duration-300 ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && !complete ? (
        <div className="kt-seller-detail-swap mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-gray-500">
            {t("urmall.biz.dash.missingDetails")}
          </p>
          <ul className="mt-3 space-y-2">
            {missingItems.slice(0, 7).map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm font-bold text-gray-700">
                <CheckCircle2 className="mt-0.5 shrink-0 text-gray-400" size={16} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          {missingItems.length > 7 ? (
            <p className="mt-2 text-xs font-bold text-gray-500">
              {t("urmall.biz.dash.moreDetails", { count: missingItems.length - 7 })}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onEditProfile}
            className="mt-3 h-10 w-full rounded-lg bg-emerald-600 px-4 text-sm font-black text-white transition hover:bg-emerald-700"
          >
            {t("urmall.biz.dash.fixNow")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
