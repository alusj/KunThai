import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, Play, Share2, Trash2 } from "lucide-react";

import CenteredModal from "../../shared/CenteredModal";
import { haptics } from "../../../Backend/services/feedbackService";
import { postingStages } from "../ExploreTabs/urfeed/feed/composer/postReviewPipeline";
import { t } from "../../../i18n";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../i18n/index.js";

// Rendered into <body> (like PostOutboxIndicator): inside Explore, an ancestor
// with a transform turned `position: fixed` into page-relative positioning, so
// the card scrolled away with the feed like an inline block instead of floating.
const FLOATING_TOP = { top: "calc(var(--kt-safe-area-top, 0px) + 0.75rem)" };

// A post that is still uploading shrinks to a progress ring after this long, so
// it stops covering the feed while the upload continues in the background.
const AUTO_COLLAPSE_MS = 5000;

export default function PostingStatusBanner({ notice, onDismiss, onShareKunThai, onWatch }) {
  useUiLocale();
  const [collapsed, setCollapsed] = useState(false);
  // X while the post is still going up: a caution card first, since stopping
  // deletes what was being posted.
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const noticeId = notice?.id || "";
  const status = notice?.status || "";
  const stillWorking = Boolean(noticeId) && !["complete", "error"].includes(status);

  // A new posting session always starts expanded so the user sees it begin.
  useEffect(() => {
    if (noticeId) setCollapsed(false);
  }, [noticeId]);

  // Collapse to the round button once posting has run for five seconds. The
  // finished and failed states expand again so they are never missed.
  useEffect(() => {
    if (!stillWorking) {
      setCollapsed(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setCollapsed(true), AUTO_COLLAPSE_MS);
    return () => window.clearTimeout(timer);
  }, [noticeId, stillWorking]);

  // The post finished or failed while the card was open: nothing to delete.
  useEffect(() => {
    if (!stillWorking) setConfirmingDiscard(false);
  }, [stillWorking]);

  if (!notice || typeof document === "undefined") return null;

  const progress = Math.max(0, Math.min(100, notice.progress || 0));
  const isError = notice.status === "error";
  const isComplete = notice.status === "complete";
  const isReviewing = notice.status === "reviewing";
  const isActive = !isError && !isComplete;
  const activeIndex = Math.max(0, postingStages.findIndex((item) => item.key === notice.stage));
  const currentStage = postingStages[activeIndex] || postingStages[0];
  const title = notice.title || (isError ? t("explore.postNotPublished") : isComplete ? t("explore.postPublished") : isReviewing ? t("explore.videoReviewRunning") : t("explore.publishingBackground"));
  const stageMessages = {
    preparing: t("explore.stagePreparing"),
    "uploading-media": t("explore.stageUploadingMedia"),
    "text-scan": t("explore.stageTextScan"),
    "media-scan": isReviewing
      ? t("explore.stageMediaScanReview")
      : t("explore.stageMediaScan"),
    publishing: t("explore.stagePublishing"),
    syncing: t("explore.stageSyncing"),
    complete: t("explore.stageComplete"),
  };
  const message = notice.interrupted
    ? t("explore.postingInterrupted")
    : notice.message || stageMessages[notice.stage] || t("explore.processingSecurely");
  const showMessage = (isError || isComplete) && message;
  const dismissLabel = isReviewing ? t("explore.cancelVideoPosting") : t("explore.dismissPosting");
  const ringColor = isError ? "#e11d48" : isComplete ? "#059669" : "#0284c7";

  if (collapsed) {
    return createPortal(
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label={t("explore.showPostingProgress", { progress })}
        style={FLOATING_TOP}
        className="kt-toast-expand-in kt-pressable fixed right-3 z-[1150] flex items-center gap-1 rounded-full border border-slate-200/90 bg-white/95 py-1 pl-1 pr-2 shadow-xl shadow-slate-900/12 backdrop-blur-xl transition-transform hover:scale-105"
      >
        <span
          className="grid h-10 w-10 place-items-center rounded-full transition-all duration-500"
          style={{ background: `conic-gradient(${ringColor} ${progress * 3.6}deg, #e2e8f0 0deg)` }}
        >
          <span className={`grid h-8 w-8 place-items-center rounded-full bg-white text-[10px] font-black ${isError ? "text-rose-600" : isComplete ? "text-emerald-700" : "text-sky-700"}`}>
            {progress}%
          </span>
        </span>
        <Maximize2 size={15} className="text-slate-500" />
      </button>,
      document.body,
    );
  }

  return createPortal(
    <>
    <div
      style={FLOATING_TOP}
      className="kt-toast-expand-in fixed left-3 right-3 z-[1150] ml-auto w-auto max-w-sm overflow-hidden rounded-3xl border border-slate-200/90 bg-white/95 shadow-2xl shadow-slate-900/20 backdrop-blur-xl sm:left-auto sm:right-4 sm:w-[22rem]"
    >
      {isActive ? (
        <>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-50 via-white to-indigo-50" />
          <div className="pointer-events-none absolute -right-12 -top-16 h-28 w-28 animate-pulse rounded-full bg-sky-200/45 blur-2xl" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 overflow-hidden bg-sky-50">
            <div className="h-full w-full origin-left animate-pulse rounded-r-full bg-gradient-to-r from-sky-400 via-indigo-500 to-sky-400" />
          </div>
        </>
      ) : null}

      <div className="relative px-3 py-2.5">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {isActive ? (
              <span className="relative flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-sky-600 text-white shadow-md shadow-sky-500/25">
                <span className="absolute h-full w-full animate-ping rounded-xl bg-sky-400/45" />
                <span className="relative h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
              </span>
            ) : null}
            <div className="min-w-0">
              <p className={`text-[11px] font-black uppercase tracking-[0.18em] ${isError ? "text-rose-600" : isComplete ? "text-emerald-700" : "text-sky-700"}`}>
                {translateUi(title)}
              </p>
              <h3 className="mt-0.5 truncate text-sm font-black text-slate-950">{isError ? t("explore.postingStopped") : currentStage.label}</h3>
              {showMessage ? <p className="mt-0.5 line-clamp-1 text-[11px] font-semibold text-slate-600">{translateUi(message)}</p> : null}
            </div>
          </div>
          <div className="flex flex-none items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-xs font-black ${isError ? "bg-rose-50 text-rose-700" : isComplete ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>
              {progress}%
            </span>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label={t("explore.minimizePosting")}
              title={t("explore.minimizePosting")}
              className="kt-pressable flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
            >
              <Minimize2 size={14} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isActive) {
                  onDismiss?.();
                  return;
                }
                haptics.warning();
                setConfirmingDiscard(true);
              }}
              aria-label={translateUi(dismissLabel)}
              title={translateUi(dismissLabel)}
              className="kt-pressable flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-black text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
            >
              X
            </button>
          </div>
        </div>

        {!isError ? (
          <>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/70">
              <div
                className={`h-full rounded-full transition-all duration-500 ${isComplete ? "bg-emerald-600" : "bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-500"}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            {/* Posted while away from Explore: one tap opens the video playing. */}
            {isComplete && notice.watch && notice.postId && onWatch ? (
              <button
                type="button"
                onClick={() => onWatch(notice)}
                className="kt-pressable mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white shadow-sm"
              >
                <Play size={15} fill="currentColor" />
                {t("ui.literals.kdb351956b95e")}
              </button>
            ) : null}
            {isComplete && onShareKunThai ? (
              <div className="mt-2 flex flex-col gap-2 rounded-2xl bg-emerald-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-black leading-5 text-emerald-900">{t("explore.shareKunThaiVisibility")}</p>
                <button
                  type="button"
                  onClick={onShareKunThai}
                  className="kt-pressable inline-flex h-9 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-xs font-black text-white"
                >
                  <Share2 size={14} />
                  {t("explore.shareKunThai")}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
    <CenteredModal open={confirmingDiscard} onClose={() => setConfirmingDiscard(false)} maxWidth="max-w-sm" labelledBy="kt-discard-post-title" quick>
      <div className="flex flex-col items-center text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
          <Trash2 size={22} strokeWidth={2.3} />
        </span>
        <h2 id="kt-discard-post-title" className="mt-3 text-lg font-black text-slate-950">{t("explore.discardPostTitle")}</h2>
        <p className="mt-1.5 text-sm font-semibold leading-6 text-slate-600">{t("explore.discardPostBody")}</p>
        <div className="mt-5 grid w-full grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setConfirmingDiscard(false)}
            className="kt-pressable h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700"
          >
            {t("explore.discardPostKeep")}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmingDiscard(false);
              haptics.heavy();
              onDismiss?.();
            }}
            className="kt-pressable h-11 rounded-2xl bg-rose-600 px-3 text-sm font-black text-white shadow-sm shadow-rose-500/25"
          >
            {t("explore.discardPostConfirm")}
          </button>
        </div>
      </div>
    </CenteredModal>
    </>,
    document.body,
  );
}
