import { useEffect, useState } from "react";
import { ChevronRight, Minimize2, Share2 } from "lucide-react";

import { postingStages } from "../ExploreTabs/urfeed/feed/composer/postReviewPipeline";

export default function PostingStatusBanner({ notice, onDismiss, onShareKunThai }) {
  const [collapsed, setCollapsed] = useState(false);
  const noticeId = notice?.id || "";

  // A new posting session always starts expanded so the user sees it begin.
  useEffect(() => {
    if (noticeId) setCollapsed(false);
  }, [noticeId]);

  if (!notice) return null;

  const progress = Math.max(0, Math.min(100, notice.progress || 0));
  const isError = notice.status === "error";
  const isComplete = notice.status === "complete";
  const isReviewing = notice.status === "reviewing";
  const isActive = !isError && !isComplete;
  const activeIndex = Math.max(0, postingStages.findIndex((item) => item.key === notice.stage));
  const currentStage = postingStages[activeIndex] || postingStages[0];
  const title = notice.title || (isError ? "Post not published" : isComplete ? "Post published" : isReviewing ? "Video review running" : "Publishing in background");
  const stageMessages = {
    preparing: "Locking your draft and preparing the upload.",
    "uploading-media": "Uploading your original media securely before safety scanning.",
    "text-scan": "Scanning text for policy violations and unsafe content.",
    "media-scan": isReviewing
      ? "KunThai is checking the full uploaded video. You can keep using the app."
      : "Scanning attached media for policy violations before it reaches the feed.",
    publishing: "Publishing the approved post to Explore.",
    syncing: "Syncing the new post into your feed.",
    complete: "Your post is live on Explore.",
  };
  const message = notice.message || stageMessages[notice.stage] || "Processing your post securely.";
  const showMessage = (isError || isComplete) && message;
  const dismissLabel = isReviewing ? "Cancel video posting" : "Dismiss posting progress";
  const ringColor = isError ? "#e11d48" : isComplete ? "#059669" : "#0284c7";

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label={`Show posting progress, currently ${progress} percent`}
        className="kt-toast-expand-in kt-pressable fixed right-3 top-3 z-[90] flex items-center gap-1 rounded-full border border-slate-200/90 bg-white/95 py-1 pl-1 pr-2 shadow-xl shadow-slate-900/12 backdrop-blur-xl transition-transform hover:scale-105"
      >
        <span
          className="grid h-10 w-10 place-items-center rounded-full transition-all duration-500"
          style={{ background: `conic-gradient(${ringColor} ${progress * 3.6}deg, #e2e8f0 0deg)` }}
        >
          <span className={`grid h-8 w-8 place-items-center rounded-full bg-white text-[10px] font-black ${isError ? "text-rose-600" : isComplete ? "text-emerald-700" : "text-sky-700"}`}>
            {progress}%
          </span>
        </span>
        <ChevronRight size={16} className="text-slate-500" />
      </button>
    );
  }

  return (
    <div className="kt-toast-expand-in fixed left-3 right-3 top-3 z-[90] mx-auto max-w-xl overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-xl shadow-slate-900/12 backdrop-blur-xl">
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
                {title}
              </p>
              <h3 className="mt-0.5 truncate text-sm font-black text-slate-950">{isError ? "Review stopped" : currentStage.label}</h3>
              {showMessage ? <p className="mt-0.5 line-clamp-1 text-[11px] font-semibold text-slate-600">{message}</p> : null}
            </div>
          </div>
          <div className="flex flex-none items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-xs font-black ${isError ? "bg-rose-50 text-rose-700" : isComplete ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>
              {progress}%
            </span>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Minimize posting progress"
              title="Minimize posting progress"
              className="kt-pressable flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
            >
              <Minimize2 size={14} />
            </button>
            <button
              type="button"
              onClick={onDismiss}
              aria-label={dismissLabel}
              title={dismissLabel}
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
            {isComplete && onShareKunThai ? (
              <div className="mt-2 flex flex-col gap-2 rounded-2xl bg-emerald-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-black leading-5 text-emerald-900">Share KunThai to gain more visibility.</p>
                <button
                  type="button"
                  onClick={onShareKunThai}
                  className="kt-pressable inline-flex h-9 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-xs font-black text-white"
                >
                  <Share2 size={14} />
                  Share KunThai
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
