import { HiOutlineArrowPath, HiOutlineExclamationTriangle, HiOutlineSparkles, HiOutlineXMark } from "react-icons/hi2";

import { useI18n } from "../../../../../../i18n";

// KAI — the "Summarise discussion" card shown at the top of a long
// comment thread. Read-only: it describes the conversation and never replies,
// posts or moderates anything.

export default function DiscussionSummary({ summary, onClose }) {
  const { t } = useI18n();

  return (
    <section className="rounded-[22px] border border-indigo-100 bg-indigo-50/70 p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.16em] text-indigo-700">
          <HiOutlineSparkles className="text-base" />
          {t("ai.explore.discussionSummary")}
        </p>
        <div className="flex items-center gap-1">
          {summary.loading ? (
            <button type="button" onClick={summary.stop} className="kt-pressable rounded-lg px-2 py-1 text-xs font-black text-slate-500">
              {t("ai.stop")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="kt-pressable flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 hover:bg-white"
            aria-label={t("ai.explore.hideSummary")}
          >
            <HiOutlineXMark />
          </button>
        </div>
      </div>

      {summary.loading ? (
        <div className="mt-3 space-y-2" aria-label={t("ai.thinking")}>
          <div className="h-3 w-full animate-pulse rounded-full bg-indigo-100" />
          <div className="h-3 w-5/6 animate-pulse rounded-full bg-indigo-100" />
          <div className="h-3 w-2/3 animate-pulse rounded-full bg-indigo-100" />
        </div>
      ) : null}

      {summary.error && !summary.loading ? (
        <div className="mt-3 flex items-start gap-2 text-sm font-bold text-rose-700" role="alert">
          <HiOutlineExclamationTriangle className="mt-0.5 flex-none" />
          <span className="min-w-0 flex-1">{summary.error.message}</span>
          {summary.error.retryable ? (
            <button type="button" onClick={summary.regenerate} className="kt-pressable inline-flex items-center gap-1 rounded-lg text-xs font-black text-rose-700">
              <HiOutlineArrowPath />
              {t("ai.retry")}
            </button>
          ) : null}
        </div>
      ) : null}

      {summary.result && !summary.loading ? (
        <>
          <p className="mt-3 text-sm leading-6 text-slate-800">{summary.result.text}</p>
          {summary.result.points?.length ? (
            <ul className="mt-2 space-y-1.5">
              {summary.result.points.map((point) => (
                <li key={point} className="flex gap-2 text-sm leading-6 text-slate-700">
                  <span className="mt-2.5 h-1.5 w-1.5 flex-none rounded-full bg-indigo-500" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-3 text-[11px] font-semibold text-slate-500">{t("ai.explore.summaryNote")}</p>
        </>
      ) : null}
    </section>
  );
}
