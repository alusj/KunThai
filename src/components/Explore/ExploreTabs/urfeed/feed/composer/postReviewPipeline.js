import {
  buildModerationMediaPayload,
  contentHasModerationFlags,
  moderateExplorePost,
} from "../../../../../../Backend/services/explore/safetyService";

const MEDIA_WARNING_WORDS = ["nude", "naked", "sex", "porn", "abuse", "violent"];

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

function findLocalMediaFlags(media = {}) {
  const values = [
    media.imageName,
    media.videoName,
    media.audioName,
    media.imageType,
    media.videoType,
    media.audioType,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return MEDIA_WARNING_WORDS.filter((word) => values.includes(word));
}

function isLikelyLocalDev() {
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname.startsWith("192.168.")
  );
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

  const localMediaFlags = findLocalMediaFlags(media);

  if (localMediaFlags.length) {
    return {
      ok: false,
      reason: "This post was stopped because the attached media appears unsafe for Explore.",
      flags: localMediaFlags,
    };
  }

  try {
    const moderationPayload = buildModerationMediaPayload(media);
    const review = await moderateExplorePost({
      body,
      media: moderationPayload,
    });

    if (!review.ok) {
      return {
        ok: false,
        reason: review.reason || "This post was stopped by KunThai safety review.",
        flags: review.flags || [],
        review,
      };
    }
  } catch (error) {
    if (isLikelyLocalDev()) {
      console.warn("[KunThai Safety] Remote moderation unavailable in local dev:", error);
    } else {
      return {
        ok: false,
        reason: error.message || "KunThai could not complete the safety review. Please try again.",
        flags: ["moderation-unavailable"],
      };
    }
  }

  onStage?.("publishing", 84);
  await wait(180);

  return { ok: true };
}