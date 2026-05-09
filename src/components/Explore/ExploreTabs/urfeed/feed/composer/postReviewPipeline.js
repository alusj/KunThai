import { contentHasModerationFlags } from "../../../../../../Backend/services/explore/safetyService";

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

function findMediaFlags(media = {}) {
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

export async function runPostReviewPipeline({ body, media, onStage }) {
  onStage?.("preparing", 12);
  await wait(260);

  onStage?.("text-scan", 34);
  await wait(420);
  const textFlags = contentHasModerationFlags(body);
  if (textFlags.length) {
    return {
      ok: false,
      reason: "This post was stopped because the text appears to break Explore safety rules.",
      flags: textFlags,
    };
  }

  onStage?.("media-scan", 62);
  await wait(media?.hasMedia ? 620 : 260);
  const mediaFlags = findMediaFlags(media);
  if (mediaFlags.length) {
    return {
      ok: false,
      reason: "This post was stopped because the attached media appears unsafe for Explore.",
      flags: mediaFlags,
    };
  }

  onStage?.("publishing", 84);
  await wait(320);

  return { ok: true };
}
