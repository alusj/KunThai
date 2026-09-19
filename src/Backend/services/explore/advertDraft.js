// Pure helpers for Explore advert drafts (no network), shared by the composer
// and unit tests.

/**
 * "Nearby Reach" (a free-text area) was retired in favour of choosing states or
 * districts. An older draft that still says "nearby" keeps its audience as
 * Recommended and asks for the area through the region picker; its text area is
 * dropped so it can no longer be sent.
 */
export function upgradeNearbyAdvertDraft(draft = {}) {
  if (draft?.audienceType !== "nearby") return draft;
  return {
    ...draft,
    audienceType: "recommended",
    targetArea: "",
    regionMode: "regions",
    targetRegions: Array.isArray(draft.targetRegions) ? draft.targetRegions : [],
  };
}
