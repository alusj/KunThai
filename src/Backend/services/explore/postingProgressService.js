export const POSTING_NOTICE_EVENT = "explore-posting-update";

const POSTING_NOTICE_KEY = "explore-posting-notice";
const VIDEO_REVIEW_JOBS_KEY = "explore-video-review-jobs";
const MAX_VIDEO_REVIEW_JOBS = 6;
const COMPLETE_NOTICE_TTL_MS = 4500;

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
  };
}

export function readPostingNotice() {
  if (!canUseStorage()) return null;

  const notice = safeJsonParse(localStorage.getItem(POSTING_NOTICE_KEY) || "null", null);
  if (!notice || typeof notice !== "object") return null;

  if (notice.status === "complete" && !notice.expiresAt) {
    clearPostingNotice(notice.id);
    return null;
  }

  if (notice.expiresAt && Number(notice.expiresAt) <= now()) {
    clearPostingNotice(notice.id);
    return null;
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
  const notice = writePostingNotice(detail);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(POSTING_NOTICE_EVENT, { detail: notice }));
  }

  return notice;
}

export function getPostingNoticeClearDelay(notice) {
  if (!notice?.expiresAt) return null;
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
