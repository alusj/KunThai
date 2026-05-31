import {
  buildModerationMediaPayload,
  moderateExplorePost,
} from "../../../../../../Backend/services/explore/safetyService";

export const postingStages = [
  { key: "preparing", label: "Securing draft" },
  { key: "uploading-media", label: "Uploading media securely" },
  { key: "text-scan", label: "Scanning for policy violations" },
  { key: "media-scan", label: "Scanning attached media" },
  { key: "publishing", label: "Publishing to Explore" },
  { key: "syncing", label: "Syncing feed" },
  { key: "complete", label: "Post live" },
];

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

export async function runPostReviewPipeline({ body, media, onStage }) {
  if (!media?.videoReviewRequired) {
    onStage?.("preparing", 12);
    await wait(180);
  }

  onStage?.("text-scan", 34);
  await wait(180);

  onStage?.("media-scan", 62);
  await wait(media?.hasMedia ? 260 : 160);

  try {
    const moderationPayload = buildModerationMediaPayload(media);
    const review = await moderateExplorePost({
      body,
      media: moderationPayload,
    });

    if (!review.ok && review.decision === "blocked") {
      logSafetyReview("post rejected", { decision: review.decision, flags: review.flags || [] });
      return {
        ok: false,
        reason: review.reason || "This post was stopped by KunThai safety review.",
        flags: review.flags || [],
        review,
      };
    }

    if (media?.videoReviewRequired && review?.decision !== "approved") {
      const reason = review?.reason || "KunThai could not complete this video's safety scan. Please try posting the video again.";
      logSafetyReview("video scan incomplete", { decision: review?.decision, reason });
      return {
        ok: false,
        retryable: true,
        reason,
        flags: review?.flags || [],
        review,
      };
    }

    const publishableReview = review?.decision === "approved"
      ? review
      : { ...review, ok: true, decision: "pending" };

    logSafetyReview("post publishable", { decision: publishableReview.decision });
    onStage?.("publishing", 84);
    await wait(180);
    return { ok: true, decision: publishableReview.decision, review: publishableReview };
  } catch (error) {
    logSafetyReview(
      isLikelyLocalDev() ? "remote moderation unavailable in local dev" : "remote moderation unavailable",
      { error },
    );

    if (media?.videoReviewRequired) {
      return {
        ok: false,
        retryable: true,
        reason: "KunThai could not complete this video's safety scan. Please try posting the video again.",
      };
    }
  }

  onStage?.("publishing", 84);
  await wait(180);

  return {
    ok: true,
    decision: "pending",
    review: {
      ok: true,
      decision: "pending",
      reason: "Post published while KunThai completes the remaining safety review.",
    },
  };
}
