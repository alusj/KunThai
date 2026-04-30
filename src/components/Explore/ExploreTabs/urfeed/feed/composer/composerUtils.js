export const DRAFT_KEY = "explore-composer-draft";
const MAX_MEDIA_BYTES = 100 * 1024 * 1024;

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (file?.size > MAX_MEDIA_BYTES) {
      reject(new Error("This media is too large for the current uploader. Please choose a video under 100MB."));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

export function parseTags(value) {
  const text = String(value || "");
  const hashtags = Array.from(new Set((text.match(/#[a-z0-9_]+/gi) || []).map((tag) => tag.slice(1).toLowerCase())));
  const mentions = Array.from(new Set((text.match(/@[a-z0-9_]+/gi) || []).map((tag) => tag.slice(1).toLowerCase())));

  return { hashtags, mentions };
}

export function readDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (!draft || typeof draft !== "object") {
      return {};
    }

    return {
      ...draft,
      image_url: "",
      video_url: "",
      audio_url: "",
    };
  } catch {
    return {};
  }
}

export function writeDraft(draft) {
  try {
    const safeDraft = {
      ...draft,
      image_url: "",
      video_url: "",
      audio_url: "",
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(safeDraft));
  } catch {
    // Media can exceed browser storage limits, so drafts stay lightweight.
  }
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}
