export const DRAFT_KEY = "explore-composer-draft";

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
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
    return draft && typeof draft === "object" ? draft : {};
  } catch {
    return {};
  }
}

export function writeDraft(draft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}
