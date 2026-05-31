import {
  buildModerationMediaPayload,
  contentHasModerationFlags,
  moderateExplorePost,
} from "../../../../../../Backend/services/explore/safetyService";

export const postingStages = [
  { key: "preparing", label: "Securing draft" },
  { key: "text-scan", label: "Scanning for policy violations" },
  { key: "media-scan", label: "Reviewing attached media" },
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
  onStage?.("preparing", 12);
  await wait(180);

  onStage?.("text-scan", 34);
  await wait(180);

  const localTextFlags = contentHasModerationFlags(body);

  if (localTextFlags.length) {
    return {
      ok: false,
      reason: "This post was stopped because the text appears to break Explore safety rules.",
      flags: localTextFlags,
    };
  }

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

    if (!review.ok) {
      logSafetyReview("remote review inconclusive", review);
    }

    logSafetyReview("post approved", { decision: review.decision || "approved" });
    onStage?.("publishing", 84);
    await wait(180);
    return { ok: true, review };
  } catch (error) {
    logSafetyReview(
      isLikelyLocalDev() ? "remote moderation unavailable in local dev" : "remote moderation unavailable",
      { error },
    );

  }

  onStage?.("publishing", 84);
  await wait(180);

  return { ok: true };
}
