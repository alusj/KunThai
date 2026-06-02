import { postingStages } from "../ExploreTabs/urfeed/feed/composer/postReviewPipeline";

export default function PostingStatusBanner({ notice, onDismiss }) {
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

  return (
    <div className="fixed left-3 right-3 top-3 z-[90] mx-auto max-w-3xl overflow-hidden rounded-[26px] border border-slate-200/90 bg-white/95 shadow-2xl shadow-slate-900/15 backdrop-blur-xl">
      {isActive ? (
        <>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-50 via-white to-indigo-50" />
          <div className="pointer-events-none absolute -right-10 -top-14 h-32 w-32 animate-pulse rounded-full bg-sky-200/50 blur-2xl" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 overflow-hidden bg-sky-50">
            <div className="h-full w-full origin-left animate-pulse rounded-r-full bg-gradient-to-r from-sky-400 via-indigo-500 to-sky-400" />
          </div>
        </>
      ) : null}

      <div className="relative px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {isActive ? (
                <span className="relative flex h-8 w-8 flex-none items-center justify-center rounded-2xl bg-sky-600 text-white shadow-lg shadow-sky-500/25">
                  <span className="absolute h-full w-full animate-ping rounded-2xl bg-sky-400/50" />
                  <span className="relative h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                </span>
              ) : null}
              <div className="min-w-0">
                <p className={`text-[11px] font-black uppercase tracking-[0.18em] ${isError ? "text-rose-600" : isComplete ? "text-emerald-700" : "text-sky-700"}`}>
                  {title}
                </p>
                {isActive ? (
                  <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                    Still working - keep using KunThai
                  </p>
                ) : null}
              </div>
            </div>
            <h3 className="mt-1 truncate text-sm font-black text-slate-950">{isError ? "Review stopped" : currentStage.label}</h3>
            <p className="mt-0.5 line-clamp-2 text-xs font-semibold leading-5 text-slate-600">{message}</p>
          </div>
          <div className="flex flex-none items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-black ${isError ? "bg-rose-50 text-rose-700" : isComplete ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}>
              {progress}%
            </span>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss posting progress"
              className="kt-pressable flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-black text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
            >
              X
            </button>
          </div>
        </div>

        {!isError ? (
          <>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/70">
              <div
                className={`h-full rounded-full transition-all duration-500 ${isComplete ? "bg-emerald-600" : "bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-500"}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
              {postingStages.map((stage, index) => {
                const done = isComplete || index < activeIndex;
                const active = stage.key === notice.stage && !isComplete;
                return (
                  <div
                    key={stage.key}
                    className={`h-1.5 rounded-full transition-colors ${done || active ? (isComplete ? "bg-emerald-600" : "bg-sky-600") : "bg-slate-200"}`}
                    title={stage.label}
                  />
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
