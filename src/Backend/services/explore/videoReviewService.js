import { EXPLORE_CACHE_EVENT, readStoredPosts, removePostFromAllCaches, writeStoredPosts } from "./cacheService";
import { deleteExplorePost, removeExploreVideoUpload, updateExploreVideoModerationStatus } from "./postService";
import {
  clearPostingNotice,
  patchVideoReviewJob,
  publishPostingNotice,
  readVideoReviewJobs,
  removeVideoReviewJob,
  upsertVideoReviewJob,
} from "./postingProgressService";
import { moderateExplorePost } from "./safetyService";

const BACKGROUND_REVIEW_TIMEOUT_MS = 52_000;
const MAX_REVIEW_ATTEMPTS = 8;
const MAX_REVIEW_AGE_MS = 2 * 60 * 60 * 1000;
const RETRY_DELAYS_MS = [18_000, 45_000, 90_000, 180_000, 300_000];
const activeReviewJobs = new Set();
const activeReviewControllers = new Map();
const scheduledReviewJobs = new Map();

function getRetryDelay(attempts = 0) {
  const index = Math.max(0, Math.min(RETRY_DELAYS_MS.length - 1, Number(attempts || 0)));
  return RETRY_DELAYS_MS[index];
}

function getJobNoticeId(job) {
  return `video-review:${job.postId || job.id}`;
}

function findStoredReviewJob(reference = "") {
  const lookup = String(reference || "").trim();
  if (!lookup) return null;

  return (
    readVideoReviewJobs().find(
      (job) => job.id === lookup || job.postId === lookup || getJobNoticeId(job) === lookup,
    ) || null
  );
}

function hasStoredReviewJob(job) {
  if (!job?.id) return false;
  return readVideoReviewJobs().some((item) => item.id === job.id && item.postId === job.postId);
}

function isReviewJobExpired(job, attempts = Number(job?.attempts || 0)) {
  const createdAt = Number(job?.createdAt || 0);
  const ageMs = createdAt ? Date.now() - createdAt : 0;
  return Number(attempts || 0) >= MAX_REVIEW_ATTEMPTS || ageMs >= MAX_REVIEW_AGE_MS;
}

function clearScheduledReviewJob(jobId) {
  const timeoutId = scheduledReviewJobs.get(jobId);
  if (typeof timeoutId !== "undefined" && typeof window !== "undefined") {
    window.clearTimeout(timeoutId);
  }
  scheduledReviewJobs.delete(jobId);
}

function logReviewCleanupError(error) {
  if (import.meta.env.DEV) {
    console.warn("[KunThai Video Review] cleanup failed", error);
  }
}

function publishReviewNotice(job, patch = {}) {
  return publishPostingNotice({
    id: getJobNoticeId(job),
    status: "reviewing",
    stage: "media-scan",
    progress: Math.max(68, Math.min(94, Number(job.progress || 78))),
    persistent: true,
    pulse: true,
    message:
      patch.message ||
      job.message ||
      "Your video is uploaded. KunThai is checking the full file in the background, so you can keep using the app.",
    ...patch,
  });
}

async function moderateVideoJob(job) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller
    ? window.setTimeout(() => controller.abort(), BACKGROUND_REVIEW_TIMEOUT_MS)
    : null;

  if (controller) {
    activeReviewControllers.set(job.id, controller);
  }

  try {
    return await moderateExplorePost({
      body: job.body || "",
      media: {
        videoUrl: job.videoUrl,
        videoReviewRequired: true,
        videoFrameDataUrls: [],
        videoFrameExtractionFailed: true,
      },
      signal: controller?.signal,
    });
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
    if (activeReviewControllers.get(job.id) === controller) {
      activeReviewControllers.delete(job.id);
    }
  }
}

async function removePendingReviewAssets(job) {
  if (!job?.id) return;

  clearScheduledReviewJob(job.id);
  activeReviewControllers.get(job.id)?.abort();
  activeReviewControllers.delete(job.id);
  removeVideoReviewJob(job.id);
  removePostFromAllCaches(job.postId);

  await Promise.all([
    job.postId ? deleteExplorePost(job.postId).catch(() => null) : null,
    job.videoUrl ? removeExploreVideoUpload(job.videoUrl).catch(() => null) : null,
  ]);
}

async function expireVideoReviewJob(job) {
  await removePendingReviewAssets(job);
  publishPostingNotice({
    id: getJobNoticeId(job),
    status: "error",
    stage: "media-scan",
    progress: 0,
    persistent: true,
    pulse: false,
    message: "KunThai stopped this video review because it took too long. Please try a shorter or compressed video.",
  });
}

function isBlockedReview(review) {
  return !review?.ok && String(review?.decision || "").toLowerCase() === "blocked";
}

function isApprovedReview(review) {
  return Boolean(review?.ok && String(review?.decision || "").toLowerCase() === "approved");
}

function scheduleVideoReviewJob(job, delayMs = 0) {
  if (!job?.id || !job?.postId || !job?.videoUrl || typeof window === "undefined") {
    return;
  }

  if (scheduledReviewJobs.has(job.id)) {
    return;
  }

  const timeoutId = window.setTimeout(() => {
    scheduledReviewJobs.delete(job.id);
    runPendingVideoReviewJob(job.id);
  }, Math.max(0, delayMs));

  scheduledReviewJobs.set(job.id, timeoutId);
}

export function startPendingVideoReviewJob(job) {
  const savedJob = upsertVideoReviewJob(job);
  publishReviewNotice(savedJob);
  scheduleVideoReviewJob(savedJob, Math.max(900, Number(savedJob.nextRunAt || 0) - Date.now()));
  return savedJob;
}

export function resumePendingVideoReviewJobs(userId = "") {
  const jobs = readVideoReviewJobs(userId).filter((job) => job.status !== "complete");
  const now = Date.now();
  const activeJobs = [];

  jobs.forEach((job) => {
    if (isReviewJobExpired(job)) {
      expireVideoReviewJob(job).catch(logReviewCleanupError);
      return;
    }

    activeJobs.push(job);
    publishReviewNotice(job);
    scheduleVideoReviewJob(job, Math.max(0, Number(job.nextRunAt || 0) - now));
  });

  return activeJobs;
}

export async function cancelPendingVideoReviewJob(reference) {
  const job = findStoredReviewJob(reference);

  if (!job) {
    clearPostingNotice(reference);
    return false;
  }

  await removePendingReviewAssets(job);
  clearPostingNotice(getJobNoticeId(job));
  return true;
}

export async function runPendingVideoReviewJob(jobId) {
  const job = readVideoReviewJobs().find((item) => item.id === jobId || item.postId === jobId);

  if (!job || activeReviewJobs.has(job.id)) {
    return null;
  }

  if (isReviewJobExpired(job)) {
    await expireVideoReviewJob(job);
    return null;
  }

  activeReviewJobs.add(job.id);
  publishReviewNotice(job, {
    progress: Math.max(78, Math.min(94, Number(job.progress || 80) + 3)),
    message: "KunThai is scanning the full uploaded video now. This can take longer for bigger files.",
  });

  try {
    const review = await moderateVideoJob(job);

    if (!hasStoredReviewJob(job)) {
      return null;
    }

    if (isApprovedReview(review)) {
      const updatedPost = await updateExploreVideoModerationStatus(job.postId, "approved");
      if (updatedPost?.id) {
        const cachedSwips = readStoredPosts("swip").filter((post) => post.id !== updatedPost.id);
        writeStoredPosts("swip", [updatedPost, ...cachedSwips]);
      }
      removeVideoReviewJob(job.id);
      publishPostingNotice({
        id: getJobNoticeId(job),
        status: "complete",
        stage: "complete",
        progress: 100,
        persistent: false,
        pulse: false,
        message: "Your video passed safety review and is now live on Swip.",
      });
      window.dispatchEvent(
        new CustomEvent(EXPLORE_CACHE_EVENT, {
          detail: { scope: "swip", postId: job.postId, type: "video-review-approved" },
        }),
      );
      return updatedPost;
    }

    if (isBlockedReview(review)) {
      await deleteExplorePost(job.postId).catch(() => null);
      await removeExploreVideoUpload(job.videoUrl).catch(() => null);
      removePostFromAllCaches(job.postId);
      removeVideoReviewJob(job.id);
      publishPostingNotice({
        id: getJobNoticeId(job),
        status: "error",
        stage: "media-scan",
        progress: 0,
        persistent: false,
        pulse: false,
        message: review.reason || "This video cannot be published because it may violate KunThai safety rules.",
      });
      return null;
    }

    throw new Error(review?.reason || "Video review is still processing.");
  } catch (error) {
    if (!hasStoredReviewJob(job)) {
      return null;
    }

    const attempts = Number(job.attempts || 0) + 1;

    if (isReviewJobExpired(job, attempts)) {
      await expireVideoReviewJob({ ...job, attempts });
      return null;
    }

    const retryDelay = getRetryDelay(attempts);
    const nextJob = patchVideoReviewJob(job.id, {
      attempts,
      progress: Math.max(82, Math.min(94, Number(job.progress || 82) + 2)),
      message:
        attempts > 1
          ? "The video is still being reviewed. KunThai will keep trying in the background."
          : "The video is uploaded. KunThai needs a little more time to finish the full safety scan.",
      nextRunAt: Date.now() + retryDelay,
    });

    if (nextJob) {
      publishReviewNotice(nextJob);
      scheduleVideoReviewJob(nextJob, retryDelay);
    }

    if (import.meta.env.DEV) {
      console.info("[KunThai Video Review] retry scheduled", {
        jobId: job.id,
        attempts,
        retryDelay,
        error: error?.message || error,
      });
    }

    return null;
  } finally {
    activeReviewJobs.delete(job.id);
  }
}
