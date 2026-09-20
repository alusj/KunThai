import { CONTENT_MODERATION_ENABLED } from "../../../config/contentModeration.js";

export const POSTING_NOTICE_EVENT = "explore-posting-update";
// Dispatched when the person dismisses a posting card, so the post that is
// still running can stop and clean up after itself.
export const POSTING_CANCEL_EVENT = "explore-posting-cancel";

const POSTING_NOTICE_KEY = "explore-posting-notice";
const VIDEO_REVIEW_JOBS_KEY = "explore-video-review-jobs";
const MAX_VIDEO_REVIEW_JOBS = 6;
const COMPLETE_NOTICE_TTL_MS = 4500;
// Statuses that mean work is still in flight, so the notice stays on screen.
const ACTIVE_POSTING_STATUSES = new Set(["posting", "uploading", "reviewing"]);
// Posting and uploading run inside this page. If the page is reloaded (Android
// can restart the WebView under memory pressure) that work is gone, so a notice
// saved by an earlier page load must not sit frozen at its last percentage.
// "reviewing" is different: that review continues on the server.
const PAGE_BOUND_POSTING_STATUSES = new Set(["posting", "uploading"]);
const PAGE_SESSION_ID = `page-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function canUseStorage() {
  return typeof localStorage !== "undefined";
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function now() {
  return Date.now();
}

export function normalizePostingNotice(detail = {}) {
  const timestamp = now();
  const status = String(detail.status || "posting");
  const isComplete = status === "complete";
  const persistent = detail.persistent ?? !isComplete;

  return {
    id: detail.id || `notice-${timestamp}`,
    status,
    stage: detail.stage || (status === "complete" ? "complete" : "preparing"),
    progress: Math.max(0, Math.min(100, Number(detail.progress || 0))),
    message: detail.message || "",
    title: detail.title || "",
    reason: detail.reason || "",
    persistent,
    pulse: detail.pulse ?? !["complete", "error"].includes(status),
    updatedAt: detail.updatedAt || timestamp,
    expiresAt: persistent ? null : detail.expiresAt || (isComplete ? timestamp + COMPLETE_NOTICE_TTL_MS : null),
    interrupted: Boolean(detail.interrupted),
    pageSession: detail.pageSession || PAGE_SESSION_ID,
  };
}

// True when the notice is for posting work that ran in an earlier page load and
// therefore stopped when that page went away.
export function wasInterruptedByReload(notice, pageSession = PAGE_SESSION_ID) {
  return Boolean(notice && PAGE_BOUND_POSTING_STATUSES.has(notice.status) && notice.pageSession !== pageSession);
}

// A notice for work that ran in an earlier page load, turned into a failure the
// person can read and dismiss.
export function interruptedPostingNotice(notice) {
  return normalizePostingNotice({
    ...notice,
    status: "error",
    stage: "",
    progress: 0,
    message: "",
    persistent: true,
    interrupted: true,
    updatedAt: now(),
  });
}

export function readPostingNotice() {
  if (!canUseStorage()) return null;

  const notice = safeJsonParse(localStorage.getItem(POSTING_NOTICE_KEY) || "null", null);
  if (!notice || typeof notice !== "object") return null;

  const moderationNotice =
    notice.status === "reviewing" ||
    ["text-scan", "media-scan"].includes(notice.stage) ||
    /moderation|review|safety scan/i.test(`${notice.title || ""} ${notice.message || ""} ${notice.reason || ""}`);

  if (!CONTENT_MODERATION_ENABLED && moderationNotice) {
    clearPostingNotice(notice.id);
    return null;
  }

  if (notice.status === "complete" && !notice.expiresAt) {
    clearPostingNotice(notice.id);
    return null;
  }

  if (notice.expiresAt && Number(notice.expiresAt) <= now()) {
    clearPostingNotice(notice.id);
    return null;
  }

  if (wasInterruptedByReload(notice)) {
    return writePostingNotice(interruptedPostingNotice(notice));
  }

  return notice;
}

export function writePostingNotice(detail = {}) {
  const notice = normalizePostingNotice(detail);

  if (canUseStorage()) {
    try {
      localStorage.setItem(POSTING_NOTICE_KEY, JSON.stringify(notice));
    } catch {
      // Storage can be unavailable in private or low-storage mobile sessions.
    }
  }

  return notice;
}

// Ids the person dismissed. Progress updates for these are dropped, so a card
// the person closed can never be brought back by the next update.
const dismissedIds = new Set();
const MAX_DISMISSED_IDS = 20;

export function isPostingNoticeDismissed(id) {
  return dismissedIds.has(String(id || ""));
}

/**
 * The person closed the card: stop showing it, remember that, and tell the
 * posting to stop.
 */
export function cancelPostingNotice(id = "") {
  const noticeId = String(id || "");
  if (noticeId) {
    dismissedIds.add(noticeId);
    if (dismissedIds.size > MAX_DISMISSED_IDS) dismissedIds.delete(dismissedIds.values().next().value);
  }
  clearPostingNotice(noticeId);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(POSTING_CANCEL_EVENT, { detail: { id: noticeId } }));
  }
}

export function clearPostingNotice(id = "") {
  if (!canUseStorage()) return;

  try {
    const current = safeJsonParse(localStorage.getItem(POSTING_NOTICE_KEY) || "null", null);
    if (!id || !current || current.id === id) {
      localStorage.removeItem(POSTING_NOTICE_KEY);
    }
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function publishPostingNotice(detail = {}) {
  // A card the person closed is never shown again by a later update.
  if (detail?.id && isPostingNoticeDismissed(detail.id)) return null;

  const notice = writePostingNotice(detail);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(POSTING_NOTICE_EVENT, { detail: notice }));
  }

  return notice;
}

/**
 * How long before a notice may be cleared automatically.
 *
 * Only finished notices expire. A post that is still uploading or under review
 * keeps its progress on screen until it completes, fails, or the person
 * cancels it — an upload that outlives a timer must never look as if it
 * vanished.
 */
export function getPostingNoticeClearDelay(notice) {
  if (!notice || ACTIVE_POSTING_STATUSES.has(notice.status)) return null;
  if (!notice.expiresAt) return null;
  return Math.max(0, Number(notice.expiresAt) - now());
}

export function readVideoReviewJobs(userId = "") {
  if (!canUseStorage()) return [];

  const jobs = safeJsonParse(localStorage.getItem(VIDEO_REVIEW_JOBS_KEY) || "[]", []);
  const safeJobs = Array.isArray(jobs) ? jobs.filter((job) => job?.id && job?.videoUrl && job?.postId) : [];
  const scopedJobs = userId ? safeJobs.filter((job) => !job.userId || job.userId === userId) : safeJobs;

  return scopedJobs.sort((first, second) => Number(first.createdAt || 0) - Number(second.createdAt || 0));
}

function writeVideoReviewJobs(jobs = []) {
  if (!canUseStorage()) return;

  try {
    localStorage.setItem(
      VIDEO_REVIEW_JOBS_KEY,
      JSON.stringify(
        jobs
          .filter((job) => job?.id && job?.videoUrl && job?.postId)
          .sort((first, second) => Number(second.updatedAt || 0) - Number(first.updatedAt || 0))
          .slice(0, MAX_VIDEO_REVIEW_JOBS),
      ),
    );
  } catch {
    // Keep the app usable if local storage is temporarily unavailable.
  }
}

export function upsertVideoReviewJob(job = {}) {
  const timestamp = now();
  const nextJob = {
    id: job.id || `video-review-${timestamp}`,
    postId: job.postId,
    userId: job.userId || "",
    videoUrl: job.videoUrl,
    body: job.body || "",
    attempts: Number(job.attempts || 0),
    status: job.status || "reviewing",
    progress: Math.max(0, Math.min(99, Number(job.progress || 76))),
    message: job.message || "",
    videoName: job.videoName || "",
    videoSize: Number(job.videoSize || 0),
    createdAt: job.createdAt || timestamp,
    updatedAt: timestamp,
    nextRunAt: Number(job.nextRunAt || 0),
  };
  const jobs = readVideoReviewJobs();
  const index = jobs.findIndex((item) => item.id === nextJob.id || item.postId === nextJob.postId);

  if (index >= 0) {
    jobs[index] = { ...jobs[index], ...nextJob };
  } else {
    jobs.unshift(nextJob);
  }

  writeVideoReviewJobs(jobs);
  return nextJob;
}

export function patchVideoReviewJob(jobId, patch = {}) {
  const jobs = readVideoReviewJobs();
  const index = jobs.findIndex((job) => job.id === jobId || job.postId === jobId);

  if (index < 0) return null;

  const nextJob = {
    ...jobs[index],
    ...patch,
    updatedAt: now(),
  };

  jobs[index] = nextJob;
  writeVideoReviewJobs(jobs);
  return nextJob;
}

export function removeVideoReviewJob(jobId) {
  const jobs = readVideoReviewJobs();
  writeVideoReviewJobs(jobs.filter((job) => job.id !== jobId && job.postId !== jobId));
}
