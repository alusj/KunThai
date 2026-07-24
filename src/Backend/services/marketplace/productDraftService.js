// Local, resumable draft for the UrMall "add a product" flow. If the app is
// killed or the network drops mid-listing, the seller returns to their filled
// form instead of a blank one.
//
// Browser limitation: File objects a user picked cannot be serialized or
// re-read after a reload, so selected photos/video must be re-attached. We keep
// their names (and any already-uploaded URLs) so the seller sees what was there.

const DRAFT_KEY = "kunthai.urmall.productDraft";
const DRAFT_TTL_MS = 1000 * 60 * 60 * 24 * 3; // 3 days

function canUseStorage() {
  return typeof localStorage !== "undefined";
}

export function readProductDraft() {
  if (!canUseStorage()) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (!raw || typeof raw !== "object") return null;
    if (!raw.savedAt || Date.now() - Number(raw.savedAt) > DRAFT_TTL_MS) {
      clearProductDraft();
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

export function writeProductDraft(form = {}, step = 0) {
  if (!canUseStorage() || !form) return;
  // Everything except the non-serializable File objects.
  const media = form.media || {};
  const payload = {
    step,
    basics: form.basics,
    details: form.details,
    pricing: form.pricing,
    delivery: form.delivery,
    mediaMeta: {
      coverImageName: media.coverImageName || "",
      coverImageUrl: media.coverImageUrl || "",
      extraImageUrls: media.extraImageUrls || [],
      extraImageCount: (media.extraImageFiles || []).length,
      videoName: media.videoName || "",
      videoUrl: media.videoUrl || "",
    },
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  } catch {
    // Private/low-storage sessions simply keep no draft.
  }
}

export function clearProductDraft() {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Ignore cleanup failures.
  }
}

// True when the draft holds anything the seller actually typed.
export function productDraftHasContent(draft) {
  if (!draft) return false;
  return Boolean(
    draft.basics?.name?.trim() ||
    draft.basics?.description?.trim() ||
    draft.pricing?.price ||
    draft.mediaMeta?.coverImageName ||
    (draft.mediaMeta?.extraImageCount || 0) > 0,
  );
}
