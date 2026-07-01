import {
  buildModerationMediaPayload,
  moderateExplorePost,
} from "../../../../../../Backend/services/explore/safetyService";
import { CONTENT_MODERATION_ENABLED } from "../../../../../../config/contentModeration";

const standardPostingStages = [
  { key: "preparing", label: "Securing draft" },
  { key: "uploading-media", label: "Uploading media securely" },
  { key: "text-scan", label: "Scanning for policy violations" },
  { key: "media-scan", label: "Scanning attached media" },
  { key: "publishing", label: "Publishing to Explore" },
  { key: "syncing", label: "Syncing feed" },
  { key: "complete", label: "Post live" },
];

export const postingStages = CONTENT_MODERATION_ENABLED
  ? standardPostingStages
  : standardPostingStages.filter((stage) => !["text-scan", "media-scan"].includes(stage.key));

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLikelyLocalDev() {
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname.startsWith("192.168.")
  );
}

function logSafetyReview(event, detail = {}) {
  if (import.meta.env.DEV) {
    console.info(`[KunThai Safety] ${event}`, detail);
  }
}

export async function runPostReviewPipeline({ body, media, onStage, reviewTimeoutMs = 0 }) {
  if (!CONTENT_MODERATION_ENABLED) {
    onStage?.("publishing", 84);
    return {
      ok: true,
      decision: "approved",
      review: {
        ok: true,
        decision: "approved",
        reason: "Automated moderation is currently disabled.",
        flags: ["moderation-disabled"],
      },
    };
  }

  if (!media?.videoReviewRequired) {
    onStage?.("preparing", 12);
    await wait(180);
  }

  onStage?.("text-scan", 64);
  await wait(180);

  onStage?.("media-scan", 76);
  await wait(media?.hasMedia ? 260 : 160);

  try {
    const controller = reviewTimeoutMs > 0 && typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller
      ? window.setTimeout(() => controller.abort(), reviewTimeoutMs)
      : null;
    const moderationPayload = buildModerationMediaPayload(media);
    let review;
    try {
      review = await moderateExplorePost({
        body,
        media: moderationPayload,
        signal: controller?.signal,
      });
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }

    if (!review?.ok) {
      const decision = review?.decision || "failed";
      const flags = review?.flags || [];
      const canContinueVideoReview = Boolean(
        media?.videoReviewRequired &&
        media?.videoUrl &&
        (
          media?.videoFrameExtractionFailed ||
          flags.includes("video-review-needs-background-check") ||
          flags.includes("video-frame-extraction-failed")
        ) &&
        decision !== "blocked"
      );

      logSafetyReview("post rejected", { decision, flags });

      return {
        ok: false,
        retryable: canContinueVideoReview,
        reason: canContinueVideoReview
          ? "Your video has been uploaded. KunThai is finishing the safety review in the background."
          : review?.reason || "This post was stopped by KunThai safety review.",
        flags,
        review,
      };
    }

    if (media?.videoReviewRequired && review?.decision !== "approved") {
      const reason =
        review?.reason ||
        "KunThai could not complete this video's safety scan. Please try posting the video again.";

      logSafetyReview("video scan incomplete", {
        decision: review?.decision,
        reason,
      });

      return {
        ok: false,
        retryable: Boolean(media?.videoUrl),
        reason,
        flags: review?.flags || [],
        review,
      };
    }

    logSafetyReview("post publishable", { decision: review.decision });

    onStage?.("publishing", 84);
    await wait(180);

    return {
      ok: true,
      decision: review.decision,
      review,
    };
  } catch (error) {
    logSafetyReview(
      isLikelyLocalDev()
        ? "remote moderation unavailable in local dev"
        : "remote moderation unavailable",
      { error },
    );

    return {
      ok: false,
      retryable: Boolean(media?.videoReviewRequired && media?.videoUrl),
      reason:
        media?.videoReviewRequired && media?.videoUrl
          ? "Your video is uploaded. KunThai will retry the safety review in the background."
          : "KunThai could not complete the safety scan. Check your connection and try again.",
    };
  }
}
