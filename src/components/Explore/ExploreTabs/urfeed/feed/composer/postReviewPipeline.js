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

    if (!review?.ok) {
      const decision = review?.decision || "failed";
      const flags = review?.flags || [];

      logSafetyReview("post rejected", { decision, flags });

      return {
        ok: false,
        retryable: false,
        reason: review?.reason || "This post was stopped by KunThai safety review.",
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
        retryable: false,
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
      retryable: false,
      reason:
        "KunThai could not complete the safety scan. Please try again.",
    };
  }
}