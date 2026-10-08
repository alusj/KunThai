// Local, resumable draft for the UrMall "add a product" flow. If the app is
// killed or the network drops mid-listing, the seller returns to their filled
// form instead of a blank one.
//
// Browser limitation: File objects a user picked cannot be serialized or
// re-read after a reload, so selected photos/video must be re-attached. Only
// already-uploaded (URL) media is restored; see restoreDraftMedia.

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

// Media for a restored draft. Picked File objects are gone after a reload, so
// a file name without an uploaded URL would show a cover/video that is never
// uploaded: keep only URL-backed media and clear the rest so the form asks for
// it again.
export function restoreDraftMedia(baseMedia = {}, mediaMeta = {}) {
  const meta = mediaMeta || {};
  const coverImageUrl = meta.coverImageUrl || baseMedia.coverImageUrl || "";
  const videoUrl = meta.videoUrl || baseMedia.videoUrl || "";
  return {
    ...baseMedia,
    coverImageFile: null,
    coverImageUrl,
    coverImageName: coverImageUrl ? meta.coverImageName || baseMedia.coverImageName || "" : "",
    extraImageFiles: [],
    extraImageUrls: meta.extraImageUrls?.length ? meta.extraImageUrls : baseMedia.extraImageUrls || [],
    videoFile: null,
    videoUrl,
    videoName: videoUrl ? meta.videoName || baseMedia.videoName || "" : "",
  };
}

// True when the draft holds anything the seller actually typed (picked files
// do not survive a reload, so they do not count).
export function productDraftHasContent(draft) {
  if (!draft) return false;
  return Boolean(
    draft.basics?.name?.trim() ||
    draft.basics?.description?.trim() ||
    draft.pricing?.price ||
    draft.mediaMeta?.coverImageUrl ||
    (draft.mediaMeta?.extraImageUrls?.length || 0) > 0,
  );
}
